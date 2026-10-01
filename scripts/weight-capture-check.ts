/**
 * Weigh-ins from the capture line (lane B): src/lib/weight.ts
 * parseWeightLine and src/components/capture/weight-capture.ts.
 *
 *   - the grammar: the positive and negative line tables (English and
 *     Vietnamese, kg and lb, the decimal comma, today / yesterday, the
 *     user's unit for a bare number, out of range), and the life day before
 *     across a month, a year and a leap day;
 *   - client/server parity: the sheet's reading (weighInOf with the user's
 *     unit) and the server's (routeWeighIn with a loaded unit) agree on
 *     every line in both units; the unit is read only for a bare number;
 *     a chip turned back into text makes the line a task on both sides;
 *   - an out-of-range reading ('w 724') stays a task on both sides and the
 *     sheet says why, in the user's words and range;
 *   - the write: a fresh reading, a replacing one (what Undo needs), an
 *     idempotent resend (never a second write), a failed read, a failed
 *     write;
 *   - Undo: a fresh weigh-in is deleted, a replacing one restores the old
 *     value and its source, a reading changed or deleted since is left
 *     alone ('gone'), a weigh-in that wrote nothing has no Undo, a forged
 *     copy is refused;
 *   - never a task and never a reward: the only write is the reading (no
 *     TaskTemplate, no ActivityEvent), the toast has no figure and neutral
 *     words, the dock and the 'Added here' row offer no Edit, and the
 *     server routes a weigh-in before any task code runs (source guards).
 *
 * No database: the server's reads and writes come in as fakes. Today is
 * Thursday 1 October 2026.
 *
 *   npx tsx scripts/weight-capture-check.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addDays, type DayKey } from "../src/lib/life-day";
import { parseCapture, type CaptureSpan } from "../src/lib/capture-parse";
import { KG_PER_LB, parseWeightLine, type ParsedWeightLine, type WeightUnit } from "../src/lib/weight";
import {
  WEIGHT_HREF,
  WEIGHT_PRIMARY,
  WEIGHT_UNDO_BAD,
  WEIGHT_UNDO_CHANGED,
  WEIGHT_UNDO_GONE,
  WEIGHT_UNDO_UNAVAILABLE,
  cleanWeightUndo,
  mayBeWeighIn,
  planWeightUndo,
  revertedWholeLine,
  routeWeighIn,
  undoWeighInCore,
  weighInCore,
  weighInOf,
  weighInOutOfRange,
  weighInPreview,
  weightChipLabel,
  weightItemOf,
  weightRangeBlocked,
  weightRangeNote,
  weightRangeText,
  weightToastCopy,
  weightUndoneCopy,
  type UndoWeighInDeps,
  type WeighInDeps,
  type WeightWrite,
} from "../src/components/capture/weight-capture";
import { toastCopy, type AddedEntry } from "../src/components/capture/capture-ui";
import { dockToastOf, type ToastHandlers } from "../src/components/capture/CaptureToast";
import { JustAdded } from "../src/components/capture/JustAdded";
import { CaptureChips } from "../src/components/capture/CaptureChips";
import type { CapturedWeight, WeightSource } from "../src/app/actions/capture";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed++;
    return;
  }
  failed++;
  console.log(`FAIL ${name}${detail === undefined ? "" : ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}

const TODAY: DayKey = "2026-10-01";
const YDAY: DayKey = "2026-09-30";
const lbKg = (lb: number): number => Math.round(lb * KG_PER_LB * 100) / 100;
const same = (a: ParsedWeightLine | null, b: ParsedWeightLine | null): boolean =>
  a === null || b === null ? a === b : a.kg === b.kg && a.day === b.day && a.typedUnit === b.typedUnit;
const show = (w: ParsedWeightLine | null): string => (w ? `${w.kg} ${w.typedUnit ?? "-"} ${w.day}` : "null");

// ── The grammar: lines that are weigh-ins ─────────────────────────────────

type Pos = { line: string; unit?: WeightUnit; kg: number; typed: WeightUnit | null; day: DayKey };
const POSITIVE: Pos[] = [
  { line: "weight 72.4", kg: 72.4, typed: null, day: TODAY },
  { line: "Weight 72.4", kg: 72.4, typed: null, day: TODAY },
  { line: "weight: 72.4", kg: 72.4, typed: null, day: TODAY },
  { line: "weight:72.4kg", kg: 72.4, typed: "kg", day: TODAY },
  { line: "weight : 72.4 kg", kg: 72.4, typed: "kg", day: TODAY },
  { line: "weigh 72.4 kgs", kg: 72.4, typed: "kg", day: TODAY },
  { line: "wt 72.4 kg", kg: 72.4, typed: "kg", day: TODAY },
  { line: "w 72.4", kg: 72.4, typed: null, day: TODAY },
  { line: "w 72,4kg", kg: 72.4, typed: "kg", day: TODAY },
  { line: "W 72", kg: 72, typed: null, day: TODAY },
  { line: "72.4 kg", kg: 72.4, typed: "kg", day: TODAY },
  { line: "72.4kg", kg: 72.4, typed: "kg", day: TODAY },
  { line: "72,4 KG", kg: 72.4, typed: "kg", day: TODAY },
  { line: "72.4kg yesterday", kg: 72.4, typed: "kg", day: YDAY },
  { line: "weight 72.4 today", kg: 72.4, typed: null, day: TODAY },
  { line: "w 72.4 yday", kg: 72.4, typed: null, day: YDAY },
  { line: "weight 160 lb yesterday", kg: lbKg(160), typed: "lb", day: YDAY },
  { line: "weight 160lbs", kg: lbKg(160), typed: "lb", day: TODAY },
  { line: "160 lbs", kg: lbKg(160), typed: "lb", day: TODAY },
  { line: "159,6 lb", kg: lbKg(159.6), typed: "lb", day: TODAY },
  { line: "  WEIGHT   72.4   KG  ", kg: 72.4, typed: "kg", day: TODAY },
  // Vietnamese, with and without the marks.
  { line: "cân 72,4", kg: 72.4, typed: null, day: TODAY },
  { line: "Cân 72.4 kg", kg: 72.4, typed: "kg", day: TODAY },
  { line: "cân nặng 72.4 kg hôm qua", kg: 72.4, typed: "kg", day: YDAY },
  { line: "can nặng: 72.4", kg: 72.4, typed: null, day: TODAY },
  { line: "can nang 72.4 hom qua", kg: 72.4, typed: null, day: YDAY },
  { line: "cân 72.4 hôm nay", kg: 72.4, typed: null, day: TODAY },
  { line: "cân nặng 72.4", kg: 72.4, typed: null, day: TODAY }, // decomposed (NFD) marks
  // The user's unit for a bare number.
  { line: "weight 160", unit: "lb", kg: lbKg(160), typed: null, day: TODAY },
  { line: "w 72.4", unit: "lb", kg: lbKg(72.4), typed: null, day: TODAY },
  { line: "weight 72.4 kg", unit: "lb", kg: 72.4, typed: "kg", day: TODAY },
  // The range's edges.
  { line: "w 20", kg: 20, typed: null, day: TODAY },
  { line: "w 400", kg: 400, typed: null, day: TODAY },
];
for (const p of POSITIVE) {
  const got = parseWeightLine(p.line, TODAY, p.unit ?? "kg");
  check(`grammar: '${p.line}' (${p.unit ?? "kg"}) is a weigh-in of ${p.kg} kg on ${p.day}`, same(got, { kg: p.kg, typedUnit: p.typed, day: p.day }), show(got));
}

// ── The grammar: lines that are not ───────────────────────────────────────

const NEGATIVE: string[] = [
  "weight training 60m",
  "weight training",
  "buy 2kg rice",
  "w 5 sets",
  "lose 5kg by dec",
  "goal: lose 5kg",
  "goal: weight 70",
  "x weight 72.4",
  "x 72.4 kg",
  "idea: weight 72.4",
  "i: 72.4 kg",
  "! weight 72.4",
  "? weight 72.4",
  "weight 72.4 ~30m",
  "#body weight 72.4",
  "weight 72.4 #body",
  "weight 72.4 kg kg",
  "weight 72.4 kg please",
  "weight 72.4 tomorrow",
  "weight 72.4 tmr",
  "weigh in 72.4",
  "weight72.4",
  "weight",
  "weight kg",
  "72.4", // a bare number needs its unit
  "72.4 yesterday",
  "can 72.4", // plain 'can' is English
  "can i lift 72 kg",
  "w -72",
  "weight 72.",
  "weight .5",
  "weight 72.4.1",
  "weight 1,234.5 kg",
  "72 kg rice",
  "deadlift 100 kg",
  "bench 60kg x5",
  "weight 72.4 lb lb",
  "",
  "   ",
  // Out of range: refused, so the line stays a task.
  "w 724",
  "w 19.99",
  "w 400.01",
  "weight 15",
  "2kg",
  "weight 900 lb",
  "weight 30 lb",
  "weight 0",
  `weight 72.4 ${"x".repeat(80)}`,
];
for (const line of NEGATIVE) {
  for (const unit of ["kg", "lb"] as const) {
    if (unit === "lb" && (line === "w 724" || line === "w 400.01")) continue; // in range as pounds (328 kg, 181 kg): covered below
    const got = parseWeightLine(line, TODAY, unit);
    check(`grammar: '${line.slice(0, 40)}' (${unit}) is not a weigh-in`, got === null, show(got));
  }
}
check("grammar: a bare 'weight 50' is 50 kg for a kg user and 22.68 kg for a lb user", parseWeightLine("weight 50", TODAY, "kg")?.kg === 50 && parseWeightLine("weight 50", TODAY, "lb")?.kg === lbKg(50));
check("grammar: a bare 'w 724' is out of range for a kg user, 328.4 kg for a lb user", parseWeightLine("w 724", TODAY, "kg") === null && parseWeightLine("w 724", TODAY, "lb")?.kg === lbKg(724));
check("grammar: 'weight 40' is out of range for a lb user (18.1 kg)", parseWeightLine("weight 40", TODAY, "lb") === null && parseWeightLine("weight 40", TODAY, "kg")?.kg === 40);
check("grammar: not a string is not a weigh-in", parseWeightLine(undefined as unknown as string, TODAY, "kg") === null && parseWeightLine(72 as unknown as string, TODAY, "kg") === null);

// The life day before: a key's calendar day before, across a month, a year and a leap day.
for (const [today, before] of [
  ["2026-03-01", "2026-02-28"],
  ["2028-03-01", "2028-02-29"],
  ["2026-01-01", "2025-12-31"],
  ["2026-10-01", "2026-09-30"],
] as const) {
  const w = parseWeightLine("weight 72.4 yesterday", today, "kg");
  check(`grammar: 'yesterday' on ${today} is ${before} (life-day addDays agrees)`, w?.day === before && addDays(today, -1) === before, show(w));
}

// ── Client/server parity ──────────────────────────────────────────────────

async function parityChecks(): Promise<void> {
  const lines = [...POSITIVE.map((p) => p.line), ...NEGATIVE, "weight 50", "weight 40", "weight 15", "w 19.99"];
  for (const line of lines) {
    for (const unit of ["kg", "lb"] as const) {
      let unitReads = 0;
      const client = weighInOf(line, [], TODAY, unit);
      const server = await routeWeighIn(line, [], TODAY, async () => {
        unitReads++;
        return unit;
      });
      const ok = same(client, server?.w ?? null) && (server === null || server.unit === (client?.typedUnit ?? unit));
      check(`parity: '${line.slice(0, 40)}' (${unit}) reads the same on the sheet and the server`, ok, `${show(client)} / ${show(server?.w ?? null)}`);
      // The unit is read only for a bare number; a typed unit or a non-weigh-in never pays for it.
      const bare = client !== null && client.typedUnit === null;
      const couldBe = mayBeWeighIn(line, [], TODAY);
      check(`parity: '${line.slice(0, 40)}' (${unit}) reads the user's unit only when it needs it`, unitReads === (bare || (client === null && couldBe) ? 1 : 0), `${unitReads}`);
      if (client) check(`parity: '${line.slice(0, 40)}' may be a weigh-in`, couldBe);
    }
  }
  const unitThrows = await routeWeighIn("weight 72.4", [], TODAY, async () => {
    throw new Error("down");
  });
  check("parity: an unreadable unit falls back to kg (as loadWeightGoal's empty goal does)", unitThrows?.unit === "kg" && unitThrows.w.kg === 72.4, show(unitThrows?.w ?? null));
  check("parity: a line no unit could make a weigh-in is not even probed", !mayBeWeighIn("weight training 60m", [], TODAY) && !mayBeWeighIn("buy 2kg rice", [], TODAY));
  // 'weight 30' is a weigh-in for a kg user, 13.6 kg (out of range) for a lb one: may be, but routes by the user's unit.
  check("parity: 'weight 30' may be a weigh-in, and for a lb user it is a task", mayBeWeighIn("weight 30", [], TODAY) && (await routeWeighIn("weight 30", [], TODAY, async () => "lb")) === null);

  // The chip turned back into text: the whole line is a task, on both sides.
  const whole: CaptureSpan[] = [{ start: 0, end: 11 }];
  check("parity: a reverted whole line is not a weigh-in on the sheet", weighInOf("weight 72.4", whole, TODAY, "kg") === null);
  check("parity: …nor on the server", (await routeWeighIn("weight 72.4", whole, TODAY, async () => "kg")) === null && !mayBeWeighIn("weight 72.4", whole, TODAY));
  check("parity: …and it parses as a task with a title", !!parseCapture("weight 72.4", { today: TODAY, reverted: whole }).title);
  check("revert: a span over the trimmed line counts as the whole line", revertedWholeLine("  weight 72.4  ", [{ start: 2, end: 13 }]));
  check("revert: a part of the line does not", !revertedWholeLine("weight 72.4", [{ start: 0, end: 6 }]) && weighInOf("weight 72.4", [{ start: 7, end: 11 }], TODAY, "kg") !== null);
  check("revert: an empty line has nothing to revert", !revertedWholeLine("   ", [{ start: 0, end: 3 }]));
}

// ── Out of range: a task, and the sheet says so ───────────────────────────

check("range: 'w 724' is out of range in kg", JSON.stringify(weighInOutOfRange("w 724", [], TODAY, "kg")) === JSON.stringify({ value: 724, unit: "kg" }));
check("range: '2kg' is out of range", JSON.stringify(weighInOutOfRange("2kg", [], TODAY, "kg")) === JSON.stringify({ value: 2, unit: "kg" }));
check("range: 'weight 30 lb' is out of range in lb, whatever the user's unit", JSON.stringify(weighInOutOfRange("weight 30 lb", [], TODAY, "kg")) === JSON.stringify({ value: 30, unit: "lb" }));
check("range: a bare 'weight 900' for a lb user is out of range in lb", JSON.stringify(weighInOutOfRange("weight 900", [], TODAY, "lb")) === JSON.stringify({ value: 900, unit: "lb" }));
check("range: 'w 72,4' in range is not flagged; neither are task lines", ["w 72,4", "buy 2kg rice", "weight training 60m", "lose 5kg by dec", "x w 724"].every((l) => weighInOutOfRange(l, [], TODAY, "kg") === null));
check("range: a reverted line is not flagged", weighInOutOfRange("w 724", [{ start: 0, end: 5 }], TODAY, "kg") === null);
check("range: an out-of-range line is a task with a title (the server saves it so)", !!parseCapture("w 724", { today: TODAY }).title);
check("range: the range in each unit", weightRangeText("kg") === "20–400 kg" && weightRangeText("lb") === "45–881 lb", `${weightRangeText("kg")} / ${weightRangeText("lb")}`);
check(
  "range: the note says it is not logged and what it becomes",
  weightRangeNote({ value: 724, unit: "kg" }) === "724 kg is outside 20–400 kg, so this isn't logged as a weight. It would be added as a task.",
  weightRangeNote({ value: 724, unit: "kg" })
);
check("range: the block-once line says how to go on", weightRangeBlocked({ value: 724, unit: "kg" }) === "724 kg is outside 20–400 kg. Fix the number, or press Enter again to add it as a task.");

// ── The chip, the button and the paste preview ────────────────────────────

{
  const w = parseWeightLine("weight 72.4", TODAY, "kg")!;
  check("chip: 'Weight · 72.4 kg · today'", weightChipLabel(w, "kg", TODAY) === "Weight · 72.4 kg · today", weightChipLabel(w, "kg", TODAY));
  const y = parseWeightLine("weight 160 lb yesterday", TODAY, "kg")!;
  check("chip: a typed unit shows as typed, 'yesterday' as said", weightChipLabel(y, "kg", TODAY) === "Weight · 160.0 lb · yesterday", weightChipLabel(y, "kg", TODAY));
  const bareLb = parseWeightLine("weight 160", TODAY, "lb")!;
  check("chip: a bare number shows in the user's unit", weightChipLabel(bareLb, "lb", TODAY) === "Weight · 160.0 lb · today", weightChipLabel(bareLb, "lb", TODAY));
  check("button: the Add button reads 'Log weight'", WEIGHT_PRIMARY === "Log weight");
  const p = weighInPreview(y, "kg", TODAY);
  check("paste: a pasted weigh-in previews as the reading and its place", p.title === "Weight 160.0 lb" && p.where === "Train · yesterday", p);

  // The sheet's chip row for a weigh-in: one chip, no price, no feeds, no grammar.
  const html = renderToStaticMarkup(
    createElement(CaptureChips, {
      text: "weight 72.4",
      parsed: parseCapture("weight 72.4", { today: TODAY }),
      goals: [],
      rawBefore: 0,
      onRevert: () => {},
      compact: false,
      feedsOpen: true,
      onToggleFeeds: () => {},
      duplicate: null,
      mustBlocked: false,
      mustFixes: [],
      onFix: () => {},
      weighIn: weightChipLabel(w, "kg", TODAY),
      onKeepAsText: () => {},
    })
  );
  const chips = (html.match(/<li/g) ?? []).length;
  check("chips: a weigh-in shows exactly one chip, its reading", chips === 1 && html.includes("Weight · 72.4 kg · today"), html);
  check("chips: no price, no feeds, no warning on a weigh-in", !html.includes("≈") && !/Feeds/.test(html) && !html.includes("capture-warning"), html);
  check("chips: the one chip is a button that keeps the line as text", /<button[^>]*type="button"/.test(html) && html.includes("keep “weight 72.4” as text"));
  const warned = renderToStaticMarkup(
    createElement(CaptureChips, {
      text: "w 724",
      parsed: parseCapture("w 724", { today: TODAY }),
      goals: [],
      rawBefore: 0,
      onRevert: () => {},
      compact: false,
      feedsOpen: false,
      onToggleFeeds: () => {},
      duplicate: null,
      mustBlocked: false,
      mustFixes: [],
      onFix: () => {},
      weightRange: weightRangeNote({ value: 724, unit: "kg" }),
    })
  );
  check("chips: an out-of-range line shows its task chips and the range note", warned.includes("isn&#x27;t logged as a weight") && warned.includes("capture-warning"), warned);
}

// ── The write, the resend and Undo, against a fake store ──────────────────

interface FakeStore {
  rows: Map<DayKey, { kg: number; source: WeightSource }>;
  /** Every write the weigh-in made: the only ones it can make are the reading's (no TaskTemplate, no ActivityEvent). */
  writes: { op: "log" | "remove"; day: DayKey; kg?: number; source?: WeightSource }[];
}

function fakeStore(seed: [DayKey, number, WeightSource][] = []): FakeStore {
  return { rows: new Map(seed.map(([d, kg, source]) => [d, { kg, source }])), writes: [] };
}

function depsOf(s: FakeStore, o: { unit?: WeightUnit; readThrows?: boolean; logFails?: string } = {}): WeighInDeps & UndoWeighInDeps {
  return {
    loadUnit: async () => o.unit ?? "kg",
    readDay: async (day) => {
      if (o.readThrows) throw new Error("read failed");
      const r = s.rows.get(day);
      return r ? { ...r } : null;
    },
    log: async (kg, opts): Promise<WeightWrite> => {
      if (o.logFails) return { ok: false, error: o.logFails };
      s.writes.push({ op: "log", day: opts.day, kg, source: opts.source });
      const replaced = s.rows.has(opts.day);
      s.rows.set(opts.day, { kg, source: opts.source });
      return { ok: true, value: { day: opts.day, kg, replaced } };
    },
    remove: async (day) => {
      s.writes.push({ op: "remove", day });
      s.rows.delete(day);
      return { ok: true };
    },
  };
}

const handlers: ToastHandlers = { onUndo: () => {}, onEdit: () => {}, onOpen: () => {}, onShow: () => {}, onSaveAsNew: () => {} };
const SHAMING = /\b(good job|great|well done|nice|bad|fail|oops|congrat|keep it up|amazing|xp|mp|streak|level)\b|!/i;

async function writeChecks(): Promise<void> {
  // A task line is not touched here at all.
  {
    const s = fakeStore();
    const r = await weighInCore(depsOf(s), "weight training 60m", [], TODAY);
    check("write: a task line returns null (the caller saves the task) and writes nothing", r === null && s.writes.length === 0);
  }

  // A fresh reading.
  const s = fakeStore();
  const deps = depsOf(s);
  const first = await weighInCore(deps, "weight 72.4", [], TODAY);
  const item = first && first.ok ? first.value : null;
  check("write: a fresh weigh-in logs one reading, source 'capture', for today", s.writes.length === 1 && s.writes[0].kg === 72.4 && s.writes[0].source === "capture" && s.writes[0].day === TODAY, s.writes);
  check(
    "write: the result is a weigh-in item: id 'weight:<day>', no XP, View to Train, Undo deletes",
    !!item && item.id === `weight:${TODAY}` && item.projectedXp === 0 && item.href === WEIGHT_HREF && !item.duplicate && !!item.weight && item.weight.previousKg === null && item.weight.undoable && item.weight.when === "today",
    item
  );
  check("write: the only write is the reading itself (no task, no event)", s.writes.every((w) => w.op === "log") && s.rows.size === 1);

  // The resend: its first answer was lost; the line comes again with the same key.
  const resend = await weighInCore(deps, "weight 72.4", [], TODAY);
  const again = resend && resend.ok ? resend.value : null;
  check("resend: the same reading again writes nothing (one reading per day, never a second write)", s.writes.length === 1 && s.rows.size === 1 && s.rows.get(TODAY)?.kg === 72.4, s.writes);
  check("resend: it answers 'Already logged' with the same id and no Undo (nothing was written)", !!again && again.id === item?.id && again.duplicate && again.weight?.undoable === false, again);
  check("resend: its toast says so", !!again && weightToastCopy({ ...again, weight: again.weight! }).head === "Already logged");

  // Undo of the fresh one deletes the day's reading.
  const undone = await undoWeighInCore(deps, item!.weight);
  check("undo: a fresh weigh-in's Undo deletes that day's reading", undone.ok && undone.value.restoredKg === null && !s.rows.has(TODAY) && s.writes.at(-1)?.op === "remove", undone);
  const twice = await undoWeighInCore(deps, item!.weight);
  check("undo: a second Undo finds it gone and writes nothing", !twice.ok && twice.code === "gone" && twice.error === WEIGHT_UNDO_GONE && s.writes.length === 2, twice);
  const copyGone = weightUndoneCopy(item!.weight!, item!.title, null);
  check("undo: the toast says 'Removed · Weight 72.4 kg'", copyGone.head === "Removed" && copyGone.title === "Weight 72.4 kg", copyGone);

  // A replacing reading: the day had 73.0 from the Train form.
  {
    const r = fakeStore([[TODAY, 73, "manual"]]);
    const d = depsOf(r);
    const res = await weighInCore(d, "w 72,4", [], TODAY);
    const it = res && res.ok ? res.value : null;
    check("replace: a weigh-in over a reading replaces it (one per day)", r.rows.get(TODAY)?.kg === 72.4 && r.writes.length === 1, [...r.rows]);
    check("replace: the item keeps what Undo needs (73 kg, 'manual')", it?.weight?.previousKg === 73 && it.weight.previousSource === "manual" && it.weight.undoable && !it.duplicate, it?.weight);
    const t = weightToastCopy({ ...it!, weight: it!.weight! });
    check("replace: the toast says what it replaced", t.body === "72.4 kg → Train · was 73.0 kg" && t.head === "Weight logged", t);
    const u = await undoWeighInCore(d, it!.weight);
    check("replace: Undo restores 73 kg with its own source, never deletes the day", u.ok && u.value.restoredKg === 73 && r.rows.get(TODAY)?.kg === 73 && r.rows.get(TODAY)?.source === "manual" && !r.writes.some((w) => w.op === "remove"), [...r.rows]);
    const c = weightUndoneCopy(it!.weight!, it!.title, 73);
    check("replace: the toast says 'Restored · Weight 73.0 kg'", c.head === "Restored" && c.title === "Weight 73.0 kg", c);
  }

  // Changed since: Undo never wipes a reading made after the capture.
  {
    const r = fakeStore();
    const d = depsOf(r);
    const res = await weighInCore(d, "weight 72.4", [], TODAY);
    const it = res && res.ok ? res.value : null;
    r.rows.set(TODAY, { kg: 71.8, source: "manual" }); // the Train form, after
    const before = r.writes.length;
    const u = await undoWeighInCore(d, it!.weight);
    check("undo: a day changed since is left alone ('gone', nothing written)", !u.ok && u.code === "gone" && u.error === WEIGHT_UNDO_CHANGED && r.writes.length === before && r.rows.get(TODAY)?.kg === 71.8, u);
  }

  // Yesterday, in lb.
  {
    const r = fakeStore();
    const res = await weighInCore(depsOf(r, { unit: "lb" }), "weight 160 yesterday", [], TODAY);
    const it = res && res.ok ? res.value : null;
    check("lb: a bare number is the user's unit, logged in kg for yesterday", r.rows.get(YDAY)?.kg === lbKg(160) && it?.weight?.unit === "lb" && it.weight.when === "yesterday" && it.id === `weight:${YDAY}`, it);
    const t = weightToastCopy({ ...it!, weight: it!.weight! });
    check("lb: the toast reads in lb and names the day", t.body === "160.0 lb → Train · yesterday" && t.title === "160.0 lb", t);
  }

  // A read that fails: the write still goes; Undo only if the save proves it was fresh.
  {
    const r = fakeStore();
    const res = await weighInCore(depsOf(r, { readThrows: true }), "weight 72.4", [], TODAY);
    check("read fails: a fresh reading is still logged, with its Undo (the save says it was fresh)", !!res && res.ok && res.value.weight?.undoable === true && res.value.weight.previousKg === null && r.rows.size === 1);
    const r2 = fakeStore([[TODAY, 73, "manual"]]);
    const res2 = await weighInCore(depsOf(r2, { readThrows: true }), "weight 72.4", [], TODAY);
    check("read fails: a reading that replaced one it never saw has no Undo (it could not be put back)", !!res2 && res2.ok && res2.value.weight?.undoable === false && res2.value.weight.previousKg === null);
  }

  // A write that fails says so and claims nothing.
  {
    const r = fakeStore();
    const res = await weighInCore(depsOf(r, { logFails: "Weight tracking isn't set up on this database yet." }), "weight 72.4", [], TODAY);
    check("write fails: the error comes back as is, nothing logged", !!res && !res.ok && res.error === "Weight tracking isn't set up on this database yet." && r.rows.size === 0, res);
  }

  // Out of range: not a weigh-in on the server either.
  {
    const r = fakeStore();
    check("range: 'w 724' is not logged (the caller saves it as a task)", (await weighInCore(depsOf(r), "w 724", [], TODAY)) === null && r.writes.length === 0);
  }

  // Undo guards.
  {
    const r = fakeStore([[TODAY, 72.4, "capture"]]);
    const d = depsOf(r);
    const dup: CapturedWeight = { day: TODAY, kg: 72.4, unit: "kg", when: "today", previousKg: null, previousSource: null, undoable: false };
    const u = await undoWeighInCore(d, dup);
    check("undo: a weigh-in that wrote nothing has no Undo (the reading stays)", !u.ok && u.error === WEIGHT_UNDO_UNAVAILABLE && r.rows.has(TODAY) && r.writes.length === 0, u);
    for (const bad of [null, "weight", { day: "x", kg: 72.4, undoable: true, previousKg: null }, { day: TODAY, kg: 1000, undoable: true, previousKg: null }, { day: TODAY, kg: 72.4, undoable: true, previousKg: "73" }, { day: TODAY, kg: 72.4, undoable: true, previousKg: 5 }]) {
      const b = await undoWeighInCore(d, bad);
      check(`undo: a forged copy is refused (${JSON.stringify(bad)})`, !b.ok && b.error === WEIGHT_UNDO_BAD && r.writes.length === 0, b);
    }
    check("undo: an unknown source restores as 'manual'", cleanWeightUndo({ day: TODAY, kg: 72.4, undoable: true, previousKg: 73, previousSource: "hack" })?.previousSource === null);
    check("undo plan: fresh → delete, replacing → restore, changed → gone, none → gone", (
      JSON.stringify(planWeightUndo(72.4, { kg: 72.4, previousKg: null, undoable: true })) === JSON.stringify({ ok: true, step: "delete" }) &&
      JSON.stringify(planWeightUndo(72.4, { kg: 72.4, previousKg: 73, undoable: true })) === JSON.stringify({ ok: true, step: "restore", kg: 73 }) &&
      planWeightUndo(72.5, { kg: 72.4, previousKg: null, undoable: true }).ok === false &&
      planWeightUndo(null, { kg: 72.4, previousKg: 73, undoable: true }).ok === false
    ));
  }

  // The toast and the row: a record, never a reward; no Edit.
  {
    const weight: CapturedWeight = { day: TODAY, kg: 72.4, unit: "kg", when: "today", previousKg: null, previousSource: null, undoable: true };
    const it = weightItemOf(weight, false);
    const t = toastCopy(it);
    check("toast: 'Weight logged · 72.4 kg → Train', View to /train, no figure", t.head === "Weight logged" && t.body === "72.4 kg → Train" && t.figure === null && t.link?.href === "/train" && t.link.label === "View", t);
    check("toast: capture-ui's toastCopy hands a weigh-in to its own copy", JSON.stringify(t) === JSON.stringify(weightToastCopy({ ...it, weight })));
    const words = [t.head, t.body, weightRangeNote({ value: 724, unit: "kg" }), weightRangeBlocked({ value: 2, unit: "kg" }), WEIGHT_UNDO_UNAVAILABLE, WEIGHT_UNDO_GONE, WEIGHT_UNDO_CHANGED, toastCopy(weightItemOf({ ...weight, previousKg: 73 }, false)).body, toastCopy(weightItemOf(weight, true)).head];
    check("toast: neutral words — no praise, no shame, no points, no exclamation", words.every((w) => !SHAMING.test(w)), words.filter((w) => SHAMING.test(w)));

    const dock = dockToastOf({ kind: "added", key: 1, item: it, notMust: false, update: false }, { offToday: true }, handlers);
    const body = renderToStaticMarkup(createElement("div", null, dock.body));
    check("dock: Undo, a View link to /train, and no Edit", dock.action?.label === "Undo" && body.includes('href="/train"') && !body.includes(">Edit<"), body);
    const dupDock = dockToastOf({ kind: "added", key: 2, item: weightItemOf({ ...weight, undoable: false }, true), notMust: false, update: false }, { offToday: true }, handlers);
    check("dock: a weigh-in that wrote nothing offers no Undo", dupDock.action === undefined && dupDock.title === "Already logged");

    const entry = (w: CapturedWeight): AddedEntry => ({ key: `k-${w.undoable}`, item: weightItemOf(w, !w.undoable), line: { text: "weight 72.4", reverted: [] }, at: Date.now() });
    const html = renderToStaticMarkup(
      createElement(JustAdded, {
        entries: [entry(weight)],
        wide: true,
        showAll: false,
        onShowAll: () => {},
        onEdit: () => {},
        onUndo: () => {},
        busy: new Set<string>(),
        locked: new Map<string, string>(),
      })
    );
    check("row: 'Added here' shows the reading, Undo and no Edit", html.includes("Weight 72.4 kg") && html.includes(">Undo<") && !html.includes(">Edit<") && !html.includes("≈"), html);
    const dupHtml = renderToStaticMarkup(
      createElement(JustAdded, { entries: [entry({ ...weight, undoable: false })], wide: true, showAll: false, onShowAll: () => {}, onEdit: () => {}, onUndo: () => {}, busy: new Set<string>(), locked: new Map<string, string>() })
    );
    check("row: …and a weigh-in that wrote nothing has neither", !dupHtml.includes(">Undo<") && !dupHtml.includes(">Edit<"), dupHtml);
  }
}

// ── Source guards: routed before any task code, never a reward ────────────

function bodyOf(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) return "";
  const next = src.indexOf("\nexport ", start + 10);
  return src.slice(start, next < 0 ? undefined : next);
}

{
  const read = (p: string): string => readFileSync(resolve(__dirname, "..", p), "utf8");
  const actions = read("src/app/actions/capture.ts");
  const create = bodyOf(actions, "createFromCapture");
  const iw = create.indexOf("weighInFromCapture(");
  const ip = create.indexOf("prepareLine(");
  const it = create.indexOf("createTemplateCore(");
  check("server: createFromCapture routes a weigh-in (and returns) before it parses or writes a task", iw > 0 && ip > iw && it > ip && /if \(weighed\)[\s\S]*?return weighed;/.test(create.slice(iw, ip)), { iw, ip, it });
  const many = bodyOf(actions, "createManyFromCapture");
  const mw = many.indexOf("weighInFromCapture(");
  const mp = many.indexOf("prepareLine(");
  check("server: a pasted weigh-in is routed per line before the task path", mw > 0 && mp > mw && /if \(weighIn\)[\s\S]*?return weighIn;/.test(many.slice(mw, mp)), { mw, mp });
  check("server: a weigh-in's line never reaches afterSave (no ActivityEvent, no idea filing)", !/saved\.push\(/.test(many.slice(mw, mp)));
  const recap = bodyOf(actions, "recaptureFromCapture");
  const rw = recap.indexOf("WEIGH_IN_NOT_AN_EDIT");
  check("server: a weigh-in line sent as an edit is refused before the task path", rw > 0 && recap.indexOf("prepareLine(") > rw);
  check("server: the weigh-in write is logWeightCore with source 'capture'", /log: \(kg, opts\) => logWeightCore\(userId, kg, opts\)/.test(actions) && read("src/components/capture/weight-capture.ts").includes('source: "capture"'));

  const wc = read("src/components/capture/weight-capture.ts");
  const imports = wc.match(/^import[^;]+;/gm) ?? [];
  check("guard: weight-capture imports no task, ledger, activity, XP or database code", imports.every((l) => !/tasks|ledger|activity|prisma|xp|celebrat|economy|reward/i.test(l)), imports);
  check("guard: weight-capture takes only types from the server actions (it runs in the browser too)", imports.filter((l) => l.includes("app/actions")).every((l) => l.startsWith("import type")), imports);
  const qc = read("src/components/capture/QuickCapture.tsx");
  check("guard: the sheet gives a weigh-in no mark, no flight and no board flash", /if \(!item\.weight\) \{[\s\S]{0,400}void mark\([\s\S]{0,600}CAPTURED_EVENT/.test(qc));
}

parityChecks()
  .then(writeChecks)
  .catch((err) => {
    failed++;
    console.log(`FAIL async checks threw — ${err instanceof Error ? err.stack : String(err)}`);
  })
  .finally(() => {
    console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall pass (${passed})`);
    process.exit(failed ? 1 : 0);
  });
