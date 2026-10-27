/**
 * Train › Exercise, Lift mode: the set logger's page model (health-2026-10-27.md D12, D14-D19; health-brief §3.5).
 * Pure and client-safe: the rules are training.ts's, the movements training-library.ts's; this file only shapes what
 * the logger shows and keeps between a tap and the server's answer. No clock (instants are passed in), no env, no
 * randomness but newClientId, and nothing from the economy: a lift is a record (D12, D14).
 *
 *   LiftActions      the server actions (actions/training.ts) or a fixture's fakes; types only from the server
 *   liftResolverOf   a movement by key on the client: the library's, else the user's own (archived too, for old sets)
 *   LiftOverlay      what this page logged, changed or took out since the server's last view (a fake saves nothing,
 *                    and a real save lands before its refresh): mergeLift lays it over the view, the view winning by id
 *   DraftRow         a row not saved yet: its kind and flags, what was typed, and its ghost (the grey prefill ✓ accepts)
 *   initialDraftsOf  an entry's rows before any tap: the last lift's rows still to do (repeatDraftsOf), else one empty
 *                    row for a movement with no history, else none ("+ Set" adds one)
 *   rowsOf · linksOf the saved sets then the drafts, each draft at the ord it would take, chained as the server would
 *   plusDraftOf      "+ Set": the previous row copied (a drop's or a rest-pause's chain head)
 *   dropDraftOf      "Drop": a DROP row 20 % lighter, rounded down to the step (training.ts nextChainSetOf); dropPlanOf
 *                    where it goes (a second Drop continues the first); kindGhostOf a row's ghost after its kind menu
 *   fields           what a row's two fields are for a movement (weight and reps, a hold's seconds, a carry's load and
 *                    metres), their labels, keyboards and steps, the ghost's figures and a saved set's (fixKeepsWeight)
 *   copy             LIFT_COPY (plain lines, no praise), the minutes line at Finish, the clock and day words
 *   JumpBook         the big jumps asked on the page and their answers (bookWith: an answer carries within its movement)
 */
import { LIFE_TZ, type DayKey } from "@/lib/life-day";
import type { WeightUnit } from "@/lib/weight";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { durationLabel } from "@/lib/exercise";
import { movementByKey, stepOf, type SetKind } from "@/lib/training-library";
import {
  FINISH,
  asksWeight,
  carriedAnswerOf,
  chainHeadOf,
  figureOf,
  ghostLineOf,
  holdTextOf,
  measureOf,
  nextChainSetOf,
  repeatDraftsOf,
  shownOf,
  storedKgOf,
  userLiftMovementOf,
  type BigJump,
  type ChainLink,
  type FinishBound,
  type GhostSource,
  type JumpAnswer,
  type LiftMovement,
  type MovementResolver,
  type SetMeasure,
} from "@/lib/training";
import type {
  AddedEntry,
  ConfirmedSet,
  EditedSet,
  FinishedLift,
  LiftEntryView,
  LiftSessionView,
  LiftSetView,
  LoggedSet,
  StartedLift,
  TrainingResult,
  UserMovementView,
} from "@/lib/training-server";
import type { AddLiftEntryInput, ConfirmLiftSetInput, CreateMovementInput, EditLiftSetInput, FinishLiftInput, LogLiftSetInput, StartLiftInput } from "@/app/actions/training";

// ── The actions ───────────────────────────────────────────────────────────

/** The logger's writes: the server actions (the page) or fakes (fixtures), so the logger never imports a server module. */
export interface LiftActions {
  startLift: (input: StartLiftInput) => Promise<TrainingResult<StartedLift>>;
  addLiftEntry: (input: AddLiftEntryInput) => Promise<TrainingResult<AddedEntry>>;
  removeLiftEntry: (entryId: string) => Promise<TrainingResult<{ deleted: boolean; sets: number }>>;
  logLiftSet: (input: LogLiftSetInput) => Promise<TrainingResult<LoggedSet>>;
  confirmLiftSet: (input: ConfirmLiftSetInput) => Promise<TrainingResult<ConfirmedSet>>;
  editLiftSet: (input: EditLiftSetInput) => Promise<TrainingResult<EditedSet>>;
  deleteLiftSet: (setId: string) => Promise<TrainingResult<{ deleted: boolean }>>;
  finishLift: (input: FinishLiftInput) => Promise<TrainingResult<FinishedLift & { celebrations?: CelebrationEvent[] }>>;
  discardLift: (sessionId: string) => Promise<TrainingResult<{ discarded: boolean }>>;
  createMovement: (input: CreateMovementInput) => Promise<TrainingResult<UserMovementView>>;
}

/** The clock, read in handlers and effects only (a render never reads it). */
export const nowMs = (): number => Date.now();

export const newClientId = (): string => globalThis.crypto?.randomUUID?.() ?? `c${Date.now().toString(36)}${Math.floor(performance.now() * 1000).toString(36)}`;

// ── Movements ─────────────────────────────────────────────────────────────

/** A movement by key on the client (training-server resolverOf's twin): the library's, else the user's own, archived too. */
export function liftResolverOf(movements: readonly UserMovementView[]): MovementResolver {
  const own = new Map<string, LiftMovement>(movements.map((m) => [m.key, userLiftMovementOf(m.key, m)]));
  return (key) => movementByKey(key) ?? own.get(key) ?? null;
}

// ── The overlay ───────────────────────────────────────────────────────────

/** What this page wrote since the view it holds (for the lift `sessionId`). The server's view wins wherever it has the row. */
export interface LiftOverlay {
  sessionId: string | null;
  entries: LiftEntryView[];
  removedEntries: string[];
  sets: LiftSetView[];
  edits: Record<string, LiftSetView>;
  removedSets: string[];
}

export const EMPTY_OVERLAY: LiftOverlay = { sessionId: null, entries: [], removedEntries: [], sets: [], edits: {}, removedSets: [] };

/** The overlay for `sessionId`: the one held when it is that lift's, else a fresh one. */
export function overlayFor(ov: LiftOverlay, sessionId: string): LiftOverlay {
  return ov.sessionId === sessionId ? ov : { ...EMPTY_OVERLAY, sessionId };
}

/** The lift as this page knows it: the view's, with what was logged, changed or taken out here since. */
export function mergeLift(base: LiftSessionView | null, ov: LiftOverlay): LiftSessionView | null {
  if (!base) return null;
  if (ov.sessionId !== base.id) return base;
  const gone = new Set(ov.removedEntries);
  const goneSets = new Set(ov.removedSets);
  const entries = [...base.entries, ...ov.entries.filter((e) => !base.entries.some((b) => b.id === e.id))].filter((e) => !gone.has(e.id));
  return {
    ...base,
    entries: entries
      .map((e) => {
        const known = new Set(e.sets.flatMap((s) => [s.id, s.clientId]));
        const sets = [...e.sets, ...ov.sets.filter((s) => s.entryId === e.id && !known.has(s.id) && !known.has(s.clientId))]
          .filter((s) => !goneSets.has(s.id))
          .map((s) => ov.edits[s.id] ?? s)
          .sort((a, b) => a.ord - b.ord);
        return { ...e, sets };
      })
      .sort((a, b) => a.ord - b.ord),
  };
}

/** The last set's time in the lift (ms), or null with none. */
export function lastSetMsOf(lift: Pick<LiftSessionView, "entries">): number | null {
  let last: number | null = null;
  for (const e of lift.entries) {
    for (const s of e.sets) {
      const ms = Date.parse(s.doneAt);
      if (Number.isFinite(ms) && (last == null || ms > last)) last = ms;
    }
  }
  return last;
}

// ── Draft rows ────────────────────────────────────────────────────────────

/** A row's measure in kilograms and counts: a ghost, a typed draft read back, a saved set. */
export interface RowValues {
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
}

export interface DraftRow {
  /** Stable for the row's life on the page. */
  key: string;
  /** Made on the first ✓ and kept for every retry, so a resend answers the set it wrote. */
  clientId: string | null;
  kind: SetKind;
  toFailure: boolean;
  amrap: boolean;
  rir: number | null;
  /** The grey prefill: ✓ accepts it where nothing was typed. */
  ghost: RowValues | null;
  /** The ghost is the last lift's set (the entry's "last 60 × 8" line reads it). */
  fromLast: boolean;
  /** As typed, in the unit shown. */
  weight: string;
  reps: string;
  sec: string;
  dist: string;
  saving: boolean;
  error: string | null;
}

const isSegment = (k: SetKind): boolean => k === "DROP" || k === "MINI";

export function emptyDraftOf(key: string, over: Partial<DraftRow> = {}): DraftRow {
  return { key, clientId: null, kind: "WORKING", toFailure: false, amrap: false, rir: null, ghost: null, fromLast: false, weight: "", reps: "", sec: "", dist: "", saving: false, error: null, ...over };
}

/**
 * An entry's rows before the first tap: the last lift's rows it has not reached yet (kinds and chains as they were, no
 * outcomes: training.ts repeatDraftsOf), else one empty row when nothing is logged, else none.
 */
export function initialDraftsOf(entryId: string, savedCount: number, last: readonly GhostSource[] | null): DraftRow[] {
  if (last && last.length > 0) {
    return repeatDraftsOf(last)
      .slice(savedCount)
      .map((d, i) =>
        emptyDraftOf(`${entryId}:g${savedCount + i}`, {
          kind: d.kind,
          amrap: d.amrap,
          ghost: { weightKg: d.weightKg, reps: d.reps, durationSec: d.durationSec, distanceM: d.distanceM },
          fromLast: true,
        })
      );
  }
  return savedCount === 0 ? [emptyDraftOf(`${entryId}:n0`)] : [];
}

/** A typed figure: '62.5', '62,5' (a decimal comma), '−20'; null when blank, NaN when it is not a number. */
export function parseFigure(s: string): number | null {
  let t = s.trim().replace(/−/g, "-");
  if (t === "") return null;
  if (/^[+-]?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** A draft's measure: what was typed, else its ghost. A bodyweight row with nothing typed and no ghost is body weight (0 added). */
export function draftValuesOf(d: DraftRow, m: Pick<LiftMovement, "load">, unit: WeightUnit): RowValues {
  const w = parseFigure(d.weight);
  const r = parseFigure(d.reps);
  const s = parseFigure(d.sec);
  const di = parseFigure(d.dist);
  const ghostKg = d.ghost?.weightKg ?? null;
  return {
    weightKg: w != null ? (Number.isNaN(w) ? Number.NaN : storedKgOf(w, unit)) : (ghostKg ?? (m.load === "BW" ? 0 : null)),
    reps: r ?? d.ghost?.reps ?? null,
    durationSec: s ?? d.ghost?.durationSec ?? null,
    distanceM: di ?? d.ghost?.distanceM ?? null,
  };
}

export type LiftRow = { type: "set"; key: string; ord: number; set: LiftSetView } | { type: "draft"; key: string; ord: number; draft: DraftRow };

/** The saved sets in order, then the drafts, each at the ord it would take next. */
export function rowsOf(sets: readonly LiftSetView[], drafts: readonly DraftRow[]): LiftRow[] {
  const saved = [...sets].sort((a, b) => a.ord - b.ord);
  const max = saved.reduce((n, s) => Math.max(n, s.ord), 0);
  return [...saved.map((s): LiftRow => ({ type: "set", key: s.id, ord: s.ord, set: s })), ...drafts.map((d, i): LiftRow => ({ type: "draft", key: d.key, ord: max + i + 1, draft: d }))];
}

/** Each row's place in the chains: a draft DROP or rest-pause row continues the row before it, as the server chains it. */
export function linksOf(rows: readonly LiftRow[]): ChainLink[] {
  const out: ChainLink[] = [];
  for (const r of rows) {
    if (r.type === "set") {
      out.push({ ord: r.ord, kind: r.set.kind, chainOf: r.set.chainOf });
      continue;
    }
    const prev = out[out.length - 1];
    out.push({ ord: r.ord, kind: r.draft.kind, chainOf: isSegment(r.draft.kind) ? (prev ? chainHeadOf(prev) : null) : null });
  }
  return out;
}

/** The rows as ghost sources (the drop and "+ Set" read them): a draft by what it would save. */
export function sourcesOf(rows: readonly LiftRow[], m: Pick<LiftMovement, "load">, unit: WeightUnit): GhostSource[] {
  const links = linksOf(rows);
  return rows.map((r, i) => {
    const v = r.type === "set" ? r.set : draftValuesOf(r.draft, m, unit);
    const amrap = r.type === "set" ? r.set.amrap : r.draft.amrap;
    return { ord: r.ord, kind: links[i].kind, chainOf: links[i].chainOf, weightKg: v.weightKg, reps: v.reps, durationSec: v.durationSec, distanceM: v.distanceM, amrap };
  });
}

/** "+ Set": the previous row copied as a new one (a drop's or rest-pause's chain head, so a set is never a drop's weight); one empty row with none. */
export function plusDraftOf(rows: readonly LiftRow[], m: Pick<LiftMovement, "load">, unit: WeightUnit, key: string): DraftRow {
  const sources = sourcesOf(rows, m, unit).filter((s) => !(s.weightKg != null && Number.isNaN(s.weightKg)));
  const prev = sources[sources.length - 1];
  if (!prev) return emptyDraftOf(key);
  const src = isSegment(prev.kind) ? (sources.find((s) => s.ord === prev.chainOf) ?? prev) : prev;
  return emptyDraftOf(key, {
    kind: src.kind === "WARMUP" ? "WARMUP" : "WORKING",
    ghost: { weightKg: src.weightKg, reps: src.reps, durationSec: src.durationSec, distanceM: src.distanceM },
  });
}

/**
 * "Drop": a DROP row after the last one, 20 % lighter rounded down to the step; null when the last row can't continue.
 * A drop or rest-pause row still to do may wait for its reps (a drop's are typed): a second Drop continues it.
 */
export function dropDraftOf(
  rows: readonly LiftRow[],
  m: Pick<LiftMovement, "load" | "bodyFraction" | "equipment" | "stepKg">,
  unit: WeightUnit,
  bodyKg: number | null,
  last: readonly GhostSource[] | null,
  key: string
): DraftRow | null {
  const sources = sourcesOf(rows, m, unit);
  const prev = sources[sources.length - 1];
  if (!prev || prev.kind === "WARMUP" || (prev.weightKg != null && Number.isNaN(prev.weightKg)) || (prev.reps == null && !isSegment(prev.kind))) return null;
  const d = nextChainSetOf(sources, "DROP", m, unit, bodyKg, last);
  if (!d) return null;
  return emptyDraftOf(key, { kind: "DROP", ghost: { weightKg: d.weightKg, reps: d.reps, durationSec: null, distanceM: null } });
}

/**
 * Where "Drop" puts its row and what it continues: the set just logged (the last saved one, or one on its way), right
 * under it and before the ghosts still to do, so a drop follows the set that was done rather than a ghost after it;
 * past the drop and rest-pause rows this lift already added there (never the last lift's ghosts), so a second Drop
 * continues the first, 20 % lighter again. With nothing logged yet it continues the last row. Null when that row can't
 * continue (a warm-up, no reps, no lighter weight, a weight typed that is not a number).
 */
export function dropPlanOf(
  sets: readonly LiftSetView[],
  drafts: readonly DraftRow[],
  m: Pick<LiftMovement, "load" | "bodyFraction" | "equipment" | "stepKg">,
  unit: WeightUnit,
  bodyKg: number | null,
  last: readonly GhostSource[] | null,
  key: string
): { draft: DraftRow; at: number } | null {
  const idle = drafts.findIndex((d) => !d.saving);
  const logged = idle < 0 ? drafts.length : idle;
  let at = sets.length > 0 || logged > 0 ? logged : drafts.length;
  while (at < drafts.length && !drafts[at].fromLast && isSegment(drafts[at].kind)) at++;
  const draft = dropDraftOf(rowsOf(sets, drafts.slice(0, at)), m, unit, bodyKg, last, key);
  return draft ? { draft, at } : null;
}

/**
 * The ghost a row's kind menu leaves it (the typed figures are never touched: draftValuesOf prefers them): into a Drop
 * or a Rest-pause it continues the rows before it (nextChainSetOf: a drop 20 % lighter, a rest-pause the same load,
 * the reps blank unless the last lift had them there; nothing lighter leaves the weight blank, never the head's
 * load); back out to Working or Warm-up it copies the chain's head again ("+ Set"). Undefined: the ghost stays.
 */
export function kindGhostOf(
  before: readonly LiftRow[],
  from: SetKind,
  to: SetKind,
  m: Pick<LiftMovement, "load" | "bodyFraction" | "equipment" | "stepKg">,
  unit: WeightUnit,
  bodyKg: number | null,
  last: readonly GhostSource[] | null,
  key: string
): Pick<DraftRow, "ghost" | "fromLast"> | undefined {
  if ((to === "DROP" || to === "MINI") && from !== to) {
    const sources = sourcesOf(before, m, unit);
    const prev = sources[sources.length - 1];
    const s = prev && !(prev.weightKg != null && Number.isNaN(prev.weightKg)) ? nextChainSetOf(sources, to, m, unit, bodyKg, last) : null;
    return { ghost: { weightKg: s?.weightKg ?? null, reps: s?.reps ?? null, durationSec: null, distanceM: null }, fromLast: false };
  }
  if (isSegment(from) && (to === "WORKING" || to === "WARMUP")) return { ghost: plusDraftOf(before, m, unit, key).ghost, fromLast: false };
  return undefined;
}

/** The entry's "last 60 × 8": the next draft that copies the last lift, or null. */
export function entryGhostLineOf(drafts: readonly DraftRow[], m: Pick<LiftMovement, "load">, unit: WeightUnit): string | null {
  const d = drafts.find((x) => x.fromLast && x.ghost);
  if (!d || !d.ghost) return null;
  return ghostLineOf({ from: "LAST_SESSION", fromOrd: 0, draft: { ord: 0, kind: d.kind, chainOf: null, ...d.ghost, amrap: d.amrap } }, m, unit);
}

// ── A row's two fields ────────────────────────────────────────────────────

export type FieldKey = "weight" | "reps" | "sec" | "dist";

export interface RowFields {
  measure: SetMeasure;
  /** The first field (weight, or a hold's seconds), or null (an unloaded bodyweight movement). */
  a: FieldKey | null;
  /** The second (reps, or a carry's metres), or null (a hold). */
  b: FieldKey | null;
  /** The column heads: 'kg', 'kg added', 'kg each', 'Seconds'; 'Reps', 'Metres'. */
  aHead: string;
  bHead: string;
}

export function rowFieldsOf(m: Pick<LiftMovement, "load" | "stepKg" | "equipment">, unit: WeightUnit): RowFields {
  const measure = measureOf(m);
  if (measure === "HOLD") return { measure, a: "sec", b: null, aHead: "Seconds", bHead: "" };
  const weightHead = m.load === "BW" ? `${unit} added` : m.load === "PAIR" || m.load === "CARRY" ? `${unit} each` : unit;
  if (measure === "CARRY") return { measure, a: "weight", b: "dist", aHead: weightHead, bHead: "Metres" };
  return { measure, a: asksWeight(m) ? "weight" : null, b: "reps", aHead: asksWeight(m) ? weightHead : "", bHead: "Reps" };
}

/** One tap of a field's stepper, in the unit shown (five on a long press): the movement's weight step, 1 rep, 5 s, 5 m. */
export function fieldStepOf(field: FieldKey, m: Pick<LiftMovement, "load" | "stepKg" | "equipment">, unit: WeightUnit): number | null {
  if (field === "weight") return stepOf(m, unit);
  return field === "reps" ? 1 : 5;
}

/** A figure as a field holds it: no thousands comma (a comma reads as a decimal one), kg to the hundredth, lb to the tenth. */
export function inputFigureOf(kg: number, unit: WeightUnit): string {
  return String(shownOf(kg, unit));
}

/** A field's ghost (its placeholder): the figure ✓ would save. */
export function ghostTextOf(field: FieldKey, g: RowValues | null, unit: WeightUnit): string {
  if (!g) return "";
  if (field === "weight") return g.weightKg == null ? "" : inputFigureOf(g.weightKg, unit);
  const v = field === "reps" ? g.reps : field === "sec" ? g.durationSec : g.distanceM;
  return v == null ? "" : String(Math.round(v * 10) / 10);
}

/** A saved set's field as typed back for Fix. */
export function savedTextOf(field: FieldKey, s: LiftSetView, unit: WeightUnit): string {
  return ghostTextOf(field, s, unit);
}

/**
 * Fix left the weight as it showed it: the stored kilograms stand (lb shows 100 kg as '220.5', which reads back as
 * 100.02 kg), so a change to the reps alone never moves a weight.
 */
export function fixKeepsWeight(typed: string, s: LiftSetView, unit: WeightUnit): boolean {
  return typed.trim() === savedTextOf("weight", s, unit);
}

/** A saved set's cell: '62.5', '+10', 'assist 20', '0' (body weight), '1:05', '40'. */
export function cellTextOf(field: FieldKey, s: RowValues, m: Pick<LiftMovement, "load">, unit: WeightUnit): string {
  if (field === "weight") {
    const kg = s.weightKg ?? 0;
    if (m.load !== "BW") return s.weightKg == null ? "" : figureOf(kg, unit);
    if (Math.abs(kg) < 0.005) return "0";
    return kg > 0 ? `+${figureOf(kg, unit)}` : `assist ${figureOf(-kg, unit)}`;
  }
  if (field === "sec") return s.durationSec == null ? "" : holdTextOf(s.durationSec);
  const v = field === "reps" ? s.reps : s.distanceM;
  return v == null ? "" : String(Math.round(v));
}

/** A field's value one step up or down from what it holds (else its ghost, else 0); never under 0 but a bodyweight load. */
export function steppedOf(value: string, ghost: string, step: number, times: number, signed: boolean): string {
  const typed = parseFigure(value);
  const grey = parseFigure(ghost);
  const from = typed != null && !Number.isNaN(typed) ? typed : grey != null && !Number.isNaN(grey) ? grey : 0;
  const next = Math.round((from + step * times) * 1000) / 1000;
  return String(signed ? next : Math.max(0, next));
}

// ── Copy ──────────────────────────────────────────────────────────────────

/** The logger's plain lines (no praise, no "!", nothing said as paid). The server's own refusals arrive as its error. */
export const LIFT_COPY = {
  START: "Start lift",
  START_NOTE: "A record of your sets, rest and bests. It pays nothing; at Finish it can count as your gym habit.",
  NOT_LOADED: "The lift logger couldn't load just now. Reload to try again.",
  ALREADY_OPEN: "A lift is open already. Here it is.",
  CLOSED: "Your last lift was left open past its day, so it was closed at its last set.",
  NO_SETS: "No sets yet. Log a set, or discard this lift.",
  LEFT_OUT: "Rows without ✓ are left out.",
  /** Finish waits for the sets on their way to the server. */
  SAVING: "Saving sets…",
  /** The server's words (training-server LIFT_COPY.ENTRY_TAKEN): "add movement" at a place it has not seen. */
  ENTRY_TAKEN: "That place in the lift is taken already.",
  DROP_REPS: "Drop added. Type its reps.",
  NO_RECORDS: "No records yet. They start once a lift with it is finished.",
  DISCARDED: "Lift discarded. Nothing was kept.",
  ADD: "Add a movement",
  FINISH: "Finish",
  FINISH_LIFT: "Finish lift",
  RPE: "How hard was it? (0 to 10, a record only)",
  NAME: "Name (optional)",
  MINUTES: "Minutes, if fewer",
  EMPTY_ENTRY: "No sets yet. Tap + Set to add one.",
  BANDS_NOTE: "A main muscle counts 1 a hard set, the others 0.5. Bands, not targets.",
  NO_HARD_SETS: "No hard sets yet this week.",
  REST_OVER: "Rest over.",
} as const;

/** 'Started 18:02': an instant as the life zone's 24-hour clock. */
export function clockOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: LIFE_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** '22 Oct': a life day in fixed words (never the runtime's locale: the server and the browser would differ). */
export function dayShortOf(day: DayKey): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** '2:58', '0:20': a countdown. */
export function countdownOf(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Finish's minutes line: '58 min, from the start to now', '45 min, as you typed'; the no-sets line with none. */
export function finishMinutesLineOf(minutes: number, by: FinishBound): string {
  if (by === "NO_SETS") return LIFT_COPY.NO_SETS;
  const t = durationLabel(minutes);
  switch (by) {
    case "REPORTED":
      return `${t}, as you typed`;
    case "CLOCK":
      return `${t}, from the start to now`;
    case "LAST_SET":
      return `${t}, to your last set plus ${FINISH.GRACE_MIN} min`;
    case "CAP":
      return `${t}, the most one session counts`;
  }
}

/** The jump a set is asked about on the page (no column holds an answer: the page keeps it for Finish). */
export interface AskedJump {
  jump: BigJump;
  line: string;
  /** The set's movement: an answer carries to its own movement's jumps only. */
  movementKey: string;
}

/** The answers and the jumps they answer, kept together so one update reads both. */
export interface JumpBook {
  jumps: Record<string, AskedJump>;
  answers: Record<string, JumpAnswer>;
}

const without = <T>(r: Readonly<Record<string, T>>, key: string): Record<string, T> => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key));

/**
 * The book with a set's jump asked, or answered already by an answer this lift gave the same movement that covers it
 * (training.ts carriedAnswerOf: the same metric and best, a value at least as high); cleared with no jump.
 */
export function bookWith(b: JumpBook, setId: string, movementKey: string, jump: BigJump | null, line: string | null): JumpBook {
  if (!jump || !line) return { jumps: without(b.jumps, setId), answers: without(b.answers, setId) };
  const answered = Object.entries(b.answers).flatMap(([sid, a]) => (sid !== setId && b.jumps[sid]?.movementKey === movementKey ? [{ jump: b.jumps[sid].jump, answer: a }] : []));
  const carried = carriedAnswerOf(jump, answered);
  return { jumps: { ...b.jumps, [setId]: { jump, line, movementKey } }, answers: carried ? { ...b.answers, [setId]: carried } : without(b.answers, setId) };
}
