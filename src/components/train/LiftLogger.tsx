"use client";

/**
 * Train › Exercise, Lift mode: the set logger (docs/life-plan/health-2026-10-27.md D12, D14-D19; health-brief §3.2-§3.5).
 * A RECORD, never a reward (momentum is live): nothing here prices, marks, chimes or queues anything. A lift writes no
 * ledger row of its own; its one effect is Finish's "Counts as", the habit's own tick at its usual price, which the
 * server does (actions/training.ts finishLift). A new best is a line on the summary and in the movement's records.
 *
 *   start    one tap: "Repeat Push day" (the newest finished lift of each name, its movements copied) or Start lift
 *   entries  each movement in the lift: its "last 60 × 8", the rows (SetRow: the number chip and its kind menu,
 *            the weight, the reps, ✓), "+ Set" (the previous row copied), "Drop" (a DROP row 20 % lighter, rounded
 *            down to the step, no rest before it), its Records (LiftRecords), Take out (asks twice)
 *   ✓        one tap accepts the ghost (the last lift's set at that place, or the row it copies) and starts the rest
 *            timer (RestTimer: a visible countdown, the movement's default, no sound, never blocking; Skip). A set more
 *            than 15 % over the 8-week best asks "Big jump: 100 kg (best 80). Keep it?" with Keep or Fix (said to a
 *            screen reader with the set); Keep is kept on this page and carried to Finish (no column holds it), so a
 *            reload leaves the set a record, and it answers that movement's lighter jumps only
 *   rows     a saved set's figure or ✓ opens Fix (change, delete); the chip's menu sets the kind (Warm-up, Working,
 *            Drop, Rest-pause) or the flags (Failure, AMRAP): two taps. Plate math under a barbell's weight, a
 *            bodyweight movement's load ("body weight 72 kg + 10"), or "Reps only" with no weigh-in
 *   finish   FinishPanel (the minutes, how hard 0-10, "Counts as" pre-selected; it waits while a set is saving), then
 *            LiftSummary (the sets, the volume, each top set, the new bests and any big jump held for its Keep or Confirm)
 *   focus    a tap that takes away the focused control puts the focus where the work goes on (Fix: the field tapped;
 *            the kind menu: the row's chip; a new drop: its reps; Finish: its heading; Back: Finish)
 *   week     hard sets per muscle group this week, as bands (LiftWeek: never a target, never a debt)
 *
 * Saves: each ✓ carries its own clientId (a retry answers the set it wrote) and a movement's saves go one after
 * another, so the server numbers and chains them as the page shows them; "add movement" sends its place, so a retry
 * answers the movement it added. What was saved shows at once (lift-model LiftOverlay) and the server's refreshed view
 * takes over by id; fixtures' fakes save nothing and still answer.
 */
import { startTransition, useEffect, useId, useMemo, useRef, useState } from "react";
import type { DayKey } from "@/lib/life-day";
import type { WeightUnit } from "@/lib/weight";
import { announce } from "@/lib/celebrate";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { REST_SEC, SET_LIMITS } from "@/lib/training-library";
import {
  BIG_JUMP_COPY,
  REPS_ONLY_COPY,
  SET_KIND_OPTIONS,
  cleanSetInput,
  kindOptionsOf,
  chainHeadOf,
  loadTextOf,
  repsOnlyOf,
  restAfterOf,
  sessionSummaryOf,
  setChipOf,
  setLineOf,
  setTextOf,
  totalsLineOf,
  weightFieldLabelOf,
  withKindOption,
  type ChainLink,
  type HeldJump,
  type JumpAnswer,
  type LiftMovement,
  type RawSetInput,
  type SetKindOption,
} from "@/lib/training";
import type { FinishedLift, LiftEntryView, LiftSessionView, LiftSetView, LiftView, MovementHistory, TrainingResult, UserMovementView } from "@/lib/training-server";
import type { CreateMovementInput, EditLiftSetInput } from "@/app/actions/training";
import {
  EMPTY_OVERLAY,
  LIFT_COPY,
  bookWith,
  cellTextOf,
  clockOf,
  dayShortOf,
  draftValuesOf,
  dropPlanOf,
  emptyDraftOf,
  entryGhostLineOf,
  fieldStepOf,
  fixKeepsWeight,
  ghostTextOf,
  initialDraftsOf,
  kindGhostOf,
  lastSetMsOf,
  liftResolverOf,
  linksOf,
  mergeLift,
  newClientId,
  nowMs,
  overlayFor,
  parseFigure,
  plusDraftOf,
  rowFieldsOf,
  rowsOf,
  savedTextOf,
  type DraftRow,
  type FieldKey,
  type JumpBook,
  type LiftActions,
  type LiftOverlay,
  type LiftRow,
  type RowValues,
} from "./lift-model";
import { SetRow, type SetRowField } from "./SetRow";
import { PlateMath, loadLineOf } from "./PlateMath";
import { RestTimer } from "./RestTimer";
import { LiftRecords } from "./LiftRecords";
import { HardSetWeek } from "./LiftWeek";
import { FinishPanel, LiftSummary, type FinishDraft } from "./LiftFinish";
import { EMPTY_MOVEMENT, MovementPicker, type MovementDraft } from "./MovementPicker";

/** A saved set open on Fix: its fields as typed. */
export interface FixDraft {
  setId: string;
  weight: string;
  reps: string;
  sec: string;
  dist: string;
  error: string | null;
  /** Delete asked once (Sure?). */
  armed: boolean;
}

/** The rest timer (one a lift): the movement it follows, its length and what is left. endsAt null: start counting now. */
export interface TimerState {
  entryId: string;
  totalSec: number;
  remainingSec: number;
  endsAt: number | null;
}

/** A fixture's opening state. */
export interface LiftLoggerInitial {
  drafts?: Record<string, DraftRow[]>;
  /** A row's key (a set id, a draft key): its kind menu open. */
  menu?: string | null;
  fix?: FixDraft | null;
  /** An entry id: its Records open. */
  records?: string | null;
  picker?: { query?: string; create?: MovementDraft | null } | null;
  book?: JumpBook;
  timer?: TimerState | null;
  finish?: FinishDraft | null;
  finished?: FinishedLift | null;
  /** A row's field focused at first (its steppers shown). */
  active?: { row: string; field: FieldKey } | null;
}

const UNREACHABLE = "Couldn't reach the server. Try again.";
const SEGMENT_KINDS: ReadonlySet<string> = new Set(["DROP", "MINI"]);
const omit = <T,>(r: Readonly<Record<string, T>>, key: string): Record<string, T> => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key));

/** An action's answer, or UNREACHABLE when it threw (the network went): a row never stays "saving". */
async function call<T>(run: () => Promise<TrainingResult<T>>): Promise<TrainingResult<T>> {
  try {
    return await run();
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

/** 'Set 2', 'Warm-up', 'Drop', 'Rest-pause': a row's name. */
function rowWordOf(kind: string, chip: string): string {
  return kind === "WARMUP" ? "Warm-up" : kind === "DROP" ? "Drop" : kind === "MINI" ? "Rest-pause" : `Set ${chip}`;
}

/** The two fields of a row, for SetRow; each named with its row ('Set 2: weight, kg', 'Warm-up: reps'). */
function fieldOf(key: FieldKey, r: LiftRow, m: LiftMovement, unit: WeightUnit, fix: FixDraft | null, word: string): SetRowField {
  const what = key === "weight" ? `weight, ${weightFieldLabelOf(m, unit) ?? unit}` : key === "reps" ? (m.unilateral ? "reps a side" : "reps") : key === "sec" ? "hold, seconds" : "distance, metres";
  const label = `${word}: ${what}`;
  const fixing = r.type === "set" && fix?.setId === r.set.id;
  return {
    key,
    label,
    value: r.type === "draft" ? r.draft[key] : fixing && fix ? fix[key] : "",
    ghost: r.type === "draft" ? ghostTextOf(key, r.draft.ghost, unit) : "",
    cell: r.type === "set" ? cellTextOf(key, r.set, m, unit) : "",
    mode: key === "weight" || key === "dist" ? "decimal" : "numeric",
    step: fieldStepOf(key, m, unit),
    signed: key === "weight" && m.load === "BW",
  };
}

/** What a row would save, read back: a draft's typed figures over its ghost, a fix's typed figures. */
function rawOfValues(v: RowValues, m: LiftMovement, fields: ReturnType<typeof rowFieldsOf>): RawSetInput {
  return {
    weightKg: fields.a === "weight" || fields.measure === "CARRY" ? v.weightKg : m.load === "BW" ? 0 : null,
    reps: fields.b === "reps" ? v.reps : null,
    durationSec: fields.measure === "HOLD" || (fields.measure === "CARRY" && v.distanceM == null) ? v.durationSec : null,
    distanceM: fields.b === "dist" ? v.distanceM : null,
  };
}

/** A fix's typed figures as values (blank is none; a bodyweight weight left blank is body weight). */
function fixValuesOf(f: FixDraft, m: LiftMovement, unit: WeightUnit): RowValues {
  return draftValuesOf(emptyDraftOf(f.setId, { weight: f.weight, reps: f.reps, sec: f.sec, dist: f.dist }), m, unit);
}

interface EntryProps {
  entry: LiftEntryView;
  m: LiftMovement;
  history: MovementHistory | undefined;
  drafts: DraftRow[];
  unit: WeightUnit;
  busy: string | null;
  menu: string | null;
  fix: FixDraft | null;
  armed: boolean;
  book: JumpBook;
  timer: TimerState | null;
  recordsOpen: boolean;
  /** A fixture's focused field (its steppers shown at first). */
  initialActive: LiftLoggerInitial["active"];
  /** The row whose field has the focus now (its plate math shows). */
  focusedRow: string | null;
  /** A new drop row whose reps take the focus once. */
  autoFocusRow: string | null;
  on: {
    records: () => void;
    draftField: (key: string, field: FieldKey, value: string) => void;
    fixField: (field: FieldKey, value: string) => void;
    log: (key: string) => void;
    plus: () => void;
    drop: () => void;
    menu: (rowKey: string) => void;
    draftKind: (key: string, option: SetKindOption) => void;
    /** `after` runs once the change is saved (or refused): the row is free again. */
    setKind: (set: LiftSetView, option: SetKindOption, after?: () => void) => void;
    removeDraft: (key: string) => void;
    openFix: (set: LiftSetView) => void;
    saveFix: (set: LiftSetView) => void;
    cancelFix: () => void;
    deleteSet: (set: LiftSetView) => void;
    keep: (set: LiftSetView) => void;
    jumpFix: (set: LiftSetView) => void;
    skipRest: () => void;
    removeEntry: () => void;
    focusRow: (key: string, field: FieldKey | null) => void;
    autoFocused: () => void;
  };
}

/** After the tap's render: focus what `target` finds (the house's requestAnimationFrame pattern). */
const focusLater = (target: () => HTMLElement | null | undefined) => requestAnimationFrame(() => target()?.focus());

function LiftEntryBlock({ entry, m, history, drafts, unit, busy, menu, fix, armed, book, timer, recordsOpen, initialActive, focusedRow, autoFocusRow, on }: EntryProps) {
  const id = useId();
  const fields = rowFieldsOf(m, unit);
  const rows = rowsOf(entry.sets, drafts);
  const links = linksOf(rows);
  const last = history?.last?.sets ?? null;
  // The first row still to do (one on its way to the server is not): its plate math shows with no tap.
  const firstDraft = rows.find((r) => r.type === "draft" && !r.draft.saving)?.key ?? null;
  const canDrop = fields.measure === "REPS" && dropPlanOf(entry.sets, drafts, m, unit, entry.bodyKg, last, "probe") != null;
  const repsOnly = repsOnlyOf(m, entry.bodyKg);
  const ghost = entryGhostLineOf(drafts, m, unit);
  const sub = [
    ghost,
    m.load === "PAIR" ? "per dumbbell" : m.load === "CARRY" ? "per hand" : null,
    m.unilateral ? "reps a side" : null,
    m.load === "BW" && entry.bodyKg != null && m.bodyFraction != null ? `with body weight ${loadTextOf(entry.bodyKg, unit)}` : null,
    m.load === "BW" && fields.a === "weight" ? "below 0 is assistance" : null,
  ].filter((x): x is string => x != null);
  const entryBusy = busy === `entry:${entry.id}`;
  /** A row's chip, by its place: the focus goes back there once its menu or its fields are gone. */
  const chipAt = (i: number) => () => document.querySelector<HTMLElement>(`[data-row="${id}-${i}"] .wt-lift-chip`);
  const fieldAt = (i: number, key: FieldKey) => () => document.getElementById(`${id}-${i}-${key}`);

  return (
    <section className="wt-lift-entry" aria-labelledby={`${id}-h`}>
      <div className="wt-lift-entry-h">
        <h4 id={`${id}-h`} className="wt-lift-name">
          {m.name}
        </h4>
        <Button variant="quiet" aria-expanded={recordsOpen} aria-controls={`${id}-rec`} onClick={on.records}>
          Records
        </Button>
      </div>
      {sub.length > 0 && <p className="wt-lift-sub">{sub.join(" · ")}</p>}
      {repsOnly === "NO_BODY_WEIGHT" && <p className="wt-lift-sub">{REPS_ONLY_COPY.NO_BODY_WEIGHT}</p>}
      {recordsOpen && <LiftRecords id={`${id}-rec`} m={m} history={history} unit={unit} />}
      {rows.length > 0 ? (
        <div className="wt-lift-cols" aria-hidden="true">
          <span>Set</span>
          <span>{fields.a ? fields.aHead : ""}</span>
          <span>{fields.b ? fields.bHead : ""}</span>
          <span />
        </div>
      ) : (
        <p className="t-meta wt-lift-msg">{LIFT_COPY.EMPTY_ENTRY}</p>
      )}
      {rows.map((r, i) => {
        const chip = setChipOf(links, r.ord);
        const link = links[i];
        const word = rowWordOf(link.kind, chip);
        const others: ChainLink[] = links.filter((_, j) => j !== i);
        const flags = r.type === "set" ? r.set : r.draft;
        const options = kindOptionsOf({ ord: r.ord, kind: link.kind, chainOf: link.chainOf, toFailure: flags.toFailure, amrap: flags.amrap, rir: flags.rir }, others, m);
        const menuOpen = menu === r.key;
        const a = fields.a ? fieldOf(fields.a, r, m, unit, fix, word) : null;
        const b = fields.b ? fieldOf(fields.b, r, m, unit, fix, word) : null;
        const errId = `${id}-${i}-err`;
        const kindMenu = menuOpen && (
          <div className="wt-ex-opts wt-lift-menu" role="group" aria-label={`${word}: kind`}>
            {SET_KIND_OPTIONS.filter((o) => options.includes(o.key)).map((o) => {
              const pressed = o.key === "FAILURE" ? flags.toFailure : o.key === "AMRAP" ? flags.amrap : link.kind === o.key;
              return (
                <ChipButton
                  key={o.key}
                  pressed={pressed}
                  onClick={() => {
                    // The menu closes under the tap: the focus goes back to the row's chip (a saved set's once it is saved).
                    if (r.type === "set") on.setKind(r.set, o.key, () => focusLater(chipAt(i)));
                    else {
                      on.draftKind(r.key, o.key);
                      focusLater(chipAt(i));
                    }
                  }}
                  disabled={r.type === "set" ? busy === `set:${r.set.id}` : r.draft.saving}
                >
                  {o.label}
                </ChipButton>
              );
            })}
            {r.type === "draft" && (
              <ChipButton
                onClick={() => {
                  on.removeDraft(r.key);
                  focusLater(() => document.getElementById(`${id}-plus`));
                }}
              >
                Remove row
              </ChipButton>
            )}
          </div>
        );
        if (r.type === "draft") {
          const d = r.draft;
          const v = draftValuesOf(d, m, unit);
          const shown = setTextOf(v, m, unit);
          const line = r.key === firstDraft || r.key === focusedRow || d.weight.trim() !== "" ? loadLineOf(m, v.weightKg, entry.bodyKg, unit) : null;
          const flagWords = [d.toFailure ? "RIR 0" : null, d.amrap ? "AMRAP" : null].filter(Boolean).join(" · ");
          return (
            <SetRow
              key={r.key}
              id={`${id}-${i}`}
              chip={chip}
              chipLabel={`${word}, not logged yet. Its kind`}
              state="draft"
              a={a}
              b={b}
              onChange={(field, value) => on.draftField(r.key, field, value)}
              doneLabel={`Log ${word.toLowerCase()}${shown ? `: ${shown}` : ""}`}
              onDone={() => on.log(r.key)}
              onChip={() => on.menu(r.key)}
              menuOpen={menuOpen}
              busy={d.saving}
              initialActive={initialActive?.row === r.key ? initialActive.field : null}
              onActive={(field) => on.focusRow(r.key, field)}
              autoFocusField={autoFocusRow === r.key ? "reps" : null}
              onAutoFocused={on.autoFocused}
              errorId={d.error ? errId : null}
            >
              <PlateMath line={line} />
              {flagWords && <p className="wt-lift-line">{flagWords}</p>}
              {d.saving && <p className="wt-lift-line">Saving…</p>}
              {d.error && (
                <p id={errId} className="t-meta wt-msg" role="alert">
                  {d.error}
                </p>
              )}
              {kindMenu}
            </SetRow>
          );
        }
        const s = r.set;
        const fixing = fix?.setId === s.id;
        const asked = book.jumps[s.id];
        const answer = book.answers[s.id];
        const setBusy = busy === `set:${s.id}`;
        const flagLine = setLineOf(s, m, unit).slice(setTextOf(s, m, unit).length).replace(/^ · /, "");
        const fixLine = fixing && fix ? loadLineOf(m, fixValuesOf(fix, m, unit).weightKg, entry.bodyKg, unit) : null;
        const firstField = fields.a ?? fields.b;
        return (
          <SetRow
            key={r.key}
            id={`${id}-${i}`}
            chip={chip}
            chipLabel={`${word}, logged. Its kind`}
            state={fixing ? "fix" : "saved"}
            a={a}
            b={b}
            onChange={(field, value) => on.fixField(field, value)}
            doneLabel={fixing ? `Save ${word.toLowerCase()}` : `${word} logged: ${setLineOf(s, m, unit)}. Fix it`}
            onDone={() => (fixing ? on.saveFix(s) : on.openFix(s))}
            onOpenFix={(key) => {
              // The figure tapped becomes its field: the focus (and the phone's keyboard) goes there.
              on.openFix(s);
              focusLater(fieldAt(i, key));
            }}
            onChip={() => on.menu(r.key)}
            menuOpen={menuOpen}
            busy={setBusy}
            initialActive={initialActive?.row === r.key ? initialActive.field : null}
            onActive={(field) => on.focusRow(r.key, field)}
            errorId={fixing && fix?.error ? errId : null}
          >
            {fixing && <PlateMath line={fixLine} />}
            {!fixing && flagLine && <p className="wt-lift-line">{flagLine}</p>}
            {!fixing && asked && !answer && (
              <div className="wt-lift-jump" role="group" aria-label="Big jump">
                <p className="wt-lift-msg">{asked.line}</p>
                <div className="wt-lift-acts">
                  <Button variant="secondary" onClick={() => on.keep(s)} disabled={setBusy}>
                    {BIG_JUMP_COPY.KEEP}
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      on.jumpFix(s);
                      if (firstField) focusLater(fieldAt(i, firstField));
                    }}
                    disabled={setBusy}
                  >
                    {BIG_JUMP_COPY.FIX}
                  </Button>
                </div>
              </div>
            )}
            {!fixing && asked?.jump.level === "DOUBLE" && answer === "KEPT" && <p className="wt-lift-line">{BIG_JUMP_COPY.DOUBLE_NOTE}</p>}
            {fixing && fix && (
              <>
                {fix.error && (
                  <p id={errId} className="t-meta wt-msg" role="alert">
                    {fix.error}
                  </p>
                )}
                <div className="wt-lift-acts">
                  <Button variant="quiet" onClick={() => on.deleteSet(s)} disabled={setBusy} aria-label={fix.armed ? `Sure? Delete ${word.toLowerCase()}` : `Delete set: ${word.toLowerCase()}`}>
                    {fix.armed ? "Sure? Delete" : "Delete set"}
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      on.cancelFix();
                      focusLater(chipAt(i));
                    }}
                    disabled={setBusy}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            )}
            {kindMenu}
          </SetRow>
        );
      })}
      {timer && timer.entryId === entry.id && <RestTimer remainingSec={timer.remainingSec} totalSec={timer.totalSec} onSkip={on.skipRest} />}
      <div className="wt-lift-foot">
        <Button id={`${id}-plus`} variant="secondary" icon="plus" onClick={on.plus} disabled={entryBusy} aria-label="Add a set: a copy of the row before">
          Set
        </Button>
        {canDrop && (
          <Button variant="secondary" onClick={on.drop} disabled={entryBusy} aria-label="Add a drop: 20 % lighter, no rest before it">
            Drop
          </Button>
        )}
        <Button variant="quiet" onClick={on.removeEntry} disabled={entryBusy} aria-label={armed ? `Sure? Take out ${m.name} and its sets` : `Take out ${m.name}`}>
          {armed ? "Sure? Take out" : "Take out"}
        </Button>
      </div>
    </section>
  );
}

export function LiftLogger({
  view,
  today,
  link,
  actions,
  initial,
}: {
  view: LiftView;
  today: DayKey;
  /** The personal EXERCISE habit due today and not done (a live day), or null: Finish pre-selects "Counts as" it. */
  link: { templateId: string; title: string } | null;
  actions: LiftActions;
  initial?: LiftLoggerInitial;
}) {
  const id = useId();
  const unit = view.unit;
  const [started, setStarted] = useState<LiftSessionView | null>(null);
  const [closedIds, setClosedIds] = useState<readonly string[]>([]);
  const [ov, setOv] = useState<LiftOverlay>(EMPTY_OVERLAY);
  const [drafts, setDrafts] = useState<Record<string, DraftRow[]>>(initial?.drafts ?? {});
  const [menu, setMenu] = useState<string | null>(initial?.menu ?? null);
  const [fix, setFix] = useState<FixDraft | null>(initial?.fix ?? null);
  const [recordsOf, setRecordsOf] = useState<string | null>(initial?.records ?? null);
  const [picker, setPicker] = useState<{ query?: string; create?: MovementDraft | null } | null>(initial?.picker ?? null);
  const [book, setBook] = useState<JumpBook>(initial?.book ?? { jumps: {}, answers: {} });
  const [timer, setTimer] = useState<TimerState | null>(initial?.timer ?? null);
  const [finish, setFinish] = useState<FinishDraft | null>(initial?.finish ?? null);
  const [finished, setFinished] = useState<FinishedLift | null>(initial?.finished ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [created, setCreated] = useState<UserMovementView[]>([]);
  /** The row whose field has the focus (its plate math shows under it). */
  const [focusedRow, setFocusedRow] = useState<string | null>(initial?.active?.row ?? null);
  /** A drop row just added with no reps to copy: its reps field takes the focus once. */
  const [autoFocusRow, setAutoFocusRow] = useState<string | null>(null);
  const queue = useRef(new Map<string, Promise<void>>());
  const lastDone = useRef<number | null>(null);
  // The book as last drawn: a save's answer reads it to know whether its jump is asked or carried (never inside setBook).
  const bookRef = useRef(book);
  useEffect(() => {
    bookRef.current = book;
  }, [book]);

  const movements = useMemo(() => [...view.movements, ...created.filter((c) => !view.movements.some((m) => m.id === c.id))], [view.movements, created]);
  const resolve = useMemo(() => liftResolverOf(movements), [movements]);
  const serverOpen = view.open && !closedIds.includes(view.open.id) ? view.open : null;
  const lift = mergeLift(serverOpen ?? (started && !closedIds.includes(started.id) ? started : null), ov);

  // The rest timer counts on its own clock (endsAt), so a phone that slept reads the right figure when it wakes.
  const running = timer != null && timer.remainingSec > 0;
  useEffect(() => {
    if (!running) return;
    const tick = () =>
      setTimer((t) => {
        if (!t || t.remainingSec <= 0) return t;
        const now = nowMs();
        const endsAt = t.endsAt ?? now + t.remainingSec * 1000;
        const remainingSec = Math.max(0, Math.ceil((endsAt - now) / 1000));
        return remainingSec === t.remainingSec && endsAt === t.endsAt ? t : { ...t, endsAt, remainingSec };
      });
    const first = window.setTimeout(tick, 0);
    const every = window.setInterval(tick, 500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [running]);
  const restOver = timer != null && timer.remainingSec <= 0;
  useEffect(() => {
    if (restOver) announce(LIFT_COPY.REST_OVER);
  }, [restOver]);

  const lastOf = (key: string) => view.history[key]?.last?.sets ?? null;
  const draftsFor = (e: LiftEntryView): DraftRow[] => drafts[e.id] ?? initialDraftsOf(e.id, e.sets.length, lastOf(e.movementKey));
  /** An entry's drafts changed (made real on the first change: the derived ones are what it held). */
  const editDrafts = (e: LiftEntryView, fn: (rows: DraftRow[]) => DraftRow[]) =>
    setDrafts((d) => ({ ...d, [e.id]: fn(d[e.id] ?? initialDraftsOf(e.id, e.sets.length, lastOf(e.movementKey))) }));
  const editOverlay = (sessionId: string, fn: (o: LiftOverlay) => LiftOverlay) => setOv((o) => fn(overlayFor(o, sessionId)));

  /** One movement's saves, one after another (the server numbers and chains each after the one before). */
  function queueSave(entryId: string, job: () => Promise<void>) {
    const prev = queue.current.get(entryId) ?? Promise.resolve();
    const next = prev.then(
      () =>
        new Promise<void>((done) => {
          startTransition(async () => {
            try {
              await job();
            } finally {
              done();
            }
          });
        })
    );
    queue.current.set(entryId, next);
  }

  function resetFor(session: LiftSessionView | null) {
    setOv(session ? { ...EMPTY_OVERLAY, sessionId: session.id } : EMPTY_OVERLAY);
    setDrafts({});
    setBook({ jumps: {}, answers: {} });
    setTimer(null);
    setFinish(null);
    setFix(null);
    setMenu(null);
    setRecordsOf(null);
    setPicker(null);
    setArmed(null);
    lastDone.current = null;
  }

  // ── start ───────────────────────────────────────────────────────────────
  function start(repeat: string | null) {
    setError(null);
    setMessage(null);
    setBusy(repeat ? `repeat:${repeat}` : "start");
    startTransition(async () => {
      const res = await call(() => actions.startLift({ ...(repeat ? { repeat } : {}), clientId: newClientId() }));
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const v = res.value;
      resetFor(v.session);
      setStarted(v.session);
      setFinished(null);
      const line = v.already ? LIFT_COPY.ALREADY_OPEN : v.closed.some((c) => !c.discarded) ? LIFT_COPY.CLOSED : null;
      setMessage(line);
      announce(line ?? `Started ${v.session.label ?? "a lift"}.`);
      // An empty lift opens the movement list at once.
      if (v.session.entries.length === 0) setPicker({});
    });
  }

  // ── movements ───────────────────────────────────────────────────────────
  function addEntry(sessionId: string, movementKey: string): Promise<boolean> {
    // Its place is sent: a retry after a lost answer asks the same place, and the server answers the movement it added
    // there (a replay) instead of adding it twice.
    const next = (lift?.entries ?? []).reduce((n, x) => Math.max(n, x.ord), 0) + 1;
    const ord = next <= SET_LIMITS.ENTRY_ORD_MAX ? next : undefined;
    return call(() => actions.addLiftEntry({ sessionId, movementKey, ...(ord != null ? { ord } : {}) })).then(async (first) => {
      // That place holds a movement this page hasn't seen (added elsewhere, or a lost answer for another pick): the
      // next place instead, once; its save re-renders the page, which shows the other one too.
      const res = !first.ok && ord != null && first.error === LIFT_COPY.ENTRY_TAKEN ? await call(() => actions.addLiftEntry({ sessionId, movementKey })) : first;
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      const entry = res.value.entry;
      editOverlay(sessionId, (o) => ({ ...o, entries: [...o.entries.filter((x) => x.id !== entry.id), entry], removedEntries: o.removedEntries.filter((x) => x !== entry.id) }));
      setPicker(null);
      announce(`${resolve(movementKey)?.name ?? "Movement"} added.`);
      return true;
    });
  }

  function pick(movementKey: string) {
    if (!lift) return;
    const sessionId = lift.id;
    setError(null);
    setBusy("add");
    startTransition(async () => {
      await addEntry(sessionId, movementKey);
      setBusy(null);
    });
  }

  function createAndAdd(input: CreateMovementInput) {
    if (!lift) return;
    const sessionId = lift.id;
    setError(null);
    setBusy("add");
    startTransition(async () => {
      const res = await call(() => actions.createMovement(input));
      if (!res.ok) {
        setBusy(null);
        setError(res.error);
        return;
      }
      const made = res.value;
      setCreated((c) => [...c.filter((x) => x.id !== made.id), made]);
      await addEntry(sessionId, made.key);
      setBusy(null);
    });
  }

  function removeEntry(e: LiftEntryView) {
    if (!lift) return;
    if (armed !== `remove:${e.id}`) {
      setArmed(`remove:${e.id}`);
      return;
    }
    const sessionId = lift.id;
    const name = resolve(e.movementKey)?.name ?? "That movement";
    setArmed(null);
    setBusy(`entry:${e.id}`);
    startTransition(async () => {
      const res = await call(() => actions.removeLiftEntry(e.id));
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      editOverlay(sessionId, (o) => ({ ...o, removedEntries: [...o.removedEntries, e.id] }));
      setDrafts((d) => omit(d, e.id));
      setTimer((t) => (t?.entryId === e.id ? null : t));
      announce(`${name} taken out.`);
    });
  }

  // ── a row's ✓ ───────────────────────────────────────────────────────────
  function log(e: LiftEntryView, key: string) {
    if (!lift) return;
    const m = resolve(e.movementKey);
    if (!m) return;
    const list = draftsFor(e);
    const at = list.findIndex((x) => x.key === key);
    const d = list[at];
    if (!d || d.saving) return;
    // Where it lands: after every saved set and every row on its way to the server (the queue keeps that order).
    const queued = rowsOf(e.sets, list.filter((x) => x.saving));
    const links = linksOf(queued);
    const ord = queued.reduce((n, r) => Math.max(n, r.ord), 0) + 1;
    const head = links[links.length - 1];
    const chainOf = SEGMENT_KINDS.has(d.kind) && head ? chainHeadOf(head) : null;
    const fields = rowFieldsOf(m, unit);
    const values = draftValuesOf(d, m, unit);
    const clean = cleanSetInput({ ord, kind: d.kind, chainOf, rir: d.rir, toFailure: d.toFailure, amrap: d.amrap, ...rawOfValues(values, m, fields) }, { movement: m, unit, others: links, bodyKg: e.bodyKg });
    if (!clean.ok) {
      const why = clean.error;
      editDrafts(e, (rows) => rows.map((x) => (x.key === key ? { ...x, error: why } : x)));
      return;
    }
    const c = clean.value;
    const clientId = d.clientId ?? newClientId();
    editDrafts(e, (rows) => rows.map((x) => (x.key === key ? { ...x, clientId, saving: true, error: null } : x)));
    setMenu(null);
    // The rest timer: none when a drop row is next, 20 s when a rest-pause row is, else the movement's rest.
    const after = list[at + 1]?.kind ?? null;
    const rest = restAfterOf(c.kind, after === "DROP" || after === "MINI" ? after : null, m);
    const now = nowMs();
    // The rest it had (from the timer, never typed): since the lift's last set, this page's or the view's (a reload
    // keeps it); none on the first set, and none past the hour a rest can be (that was a pause, not a rest).
    const prevMs = lastDone.current ?? lastSetMsOf(lift);
    const since = prevMs != null ? Math.round((now - prevMs) / 1000) : null;
    const restBefore = since != null && since >= 0 && since <= SET_LIMITS.REST_SEC_MAX ? since : null;
    lastDone.current = now;
    setTimer(rest > 0 ? { entryId: e.id, totalSec: rest, remainingSec: rest, endsAt: now + rest * 1000 } : null);
    const sessionId = lift.id;
    queueSave(e.id, async () => {
      const res = await call(() =>
        actions.logLiftSet({
          sessionId,
          entryId: e.id,
          clientId,
          kind: c.kind,
          weightKg: c.weightKg,
          reps: c.reps,
          rir: c.rir,
          toFailure: c.toFailure,
          amrap: c.amrap,
          durationSec: c.durationSec,
          distanceM: c.distanceM,
          ...(restBefore != null ? { restSec: restBefore } : {}),
        })
      );
      if (!res.ok) {
        const why = res.error;
        editDrafts(e, (rows) => rows.map((x) => (x.key === key ? { ...x, saving: false, error: why } : x)));
        setTimer((t) => (t?.entryId === e.id && t.endsAt === now + rest * 1000 ? null : t));
        return;
      }
      const set = res.value.set;
      const { jump, jumpLine } = res.value;
      editOverlay(sessionId, (o) => ({ ...o, sets: [...o.sets.filter((x) => x.clientId !== set.clientId), set] }));
      editDrafts(e, (rows) => rows.filter((x) => x.key !== key));
      // The question is said with the set (a live region mounted with it is often not read), unless a Keep carries.
      const asks = !!jump && !!jumpLine && !bookWith(bookRef.current, set.id, e.movementKey, jump, jumpLine).answers[set.id];
      if (jump) setBook((b) => bookWith(b, set.id, e.movementKey, jump, jumpLine));
      announce(`Logged ${setLineOf(set, m, unit)}.${asks ? ` ${jumpLine}` : ""}`);
    });
  }

  function plus(e: LiftEntryView) {
    const m = resolve(e.movementKey);
    if (!m) return;
    const rows = rowsOf(e.sets, draftsFor(e));
    editDrafts(e, (list) => [...list, plusDraftOf(rows, m, unit, `${e.id}:p${newClientId()}`)]);
  }

  function drop(e: LiftEntryView) {
    const m = resolve(e.movementKey);
    if (!m) return;
    // Right under the set just logged (before the ghosts still to do), continuing it.
    const plan = dropPlanOf(e.sets, draftsFor(e), m, unit, e.bodyKg, lastOf(e.movementKey), `${e.id}:d${newClientId()}`);
    if (!plan) return;
    editDrafts(e, (list) => [...list.slice(0, plan.at), plan.draft, ...list.slice(plan.at)]);
    // No rest before a drop: it follows the set at once.
    setTimer((t) => (t?.entryId === e.id ? null : t));
    // Nothing to copy for its reps (the last lift had no drop there): the reps field takes the focus, so "Drop" and the
    // reps are the whole of it. With reps to copy, ✓ accepts them in one tap and no keyboard opens.
    if (plan.draft.ghost?.reps == null) {
      setAutoFocusRow(plan.draft.key);
      announce(LIFT_COPY.DROP_REPS);
    }
  }

  function draftKind(e: LiftEntryView, key: string, option: SetKindOption) {
    const m = resolve(e.movementKey);
    const list = draftsFor(e);
    const rows = rowsOf(e.sets, list);
    const links = linksOf(rows);
    const i = rows.findIndex((r) => r.key === key);
    const r = rows[i];
    if (!m || !r || r.type !== "draft") return;
    const d = r.draft;
    const next = withKindOption({ ord: r.ord, kind: d.kind, chainOf: links[i].chainOf, toFailure: d.toFailure, amrap: d.amrap, rir: d.rir }, option, links.filter((_, j) => j !== i));
    if (!next) return;
    // Into a drop or a rest-pause the ghost continues the row before (a drop 20 % lighter, never the head's load in
    // one tap); back out, it copies the chain's head again. What was typed stays.
    const ghost = kindGhostOf(rows.slice(0, i), d.kind, next.kind, m, unit, e.bodyKg, lastOf(e.movementKey), key);
    editDrafts(e, (rs) => rs.map((x) => (x.key === key ? { ...x, kind: next.kind, toFailure: next.toFailure, amrap: next.amrap, rir: next.rir, error: null, ...ghost } : x)));
    setMenu(null);
    // The row right after the last logged set: a rest-pause row starts its 20 s countdown, a drop row ends the rest.
    if (e.sets.length > 0 && rows.slice(0, i).every((x) => x.type === "set")) {
      if (next.kind === "MINI") {
        const now = nowMs();
        setTimer({ entryId: e.id, totalSec: REST_SEC.BEFORE_MINI, remainingSec: REST_SEC.BEFORE_MINI, endsAt: now + REST_SEC.BEFORE_MINI * 1000 });
      } else if (next.kind === "DROP") setTimer((t) => (t?.entryId === e.id ? null : t));
    }
  }

  // ── a saved set ─────────────────────────────────────────────────────────
  /** A saved set changed; `after` runs once the server answered (the row is free again). */
  function edit(e: LiftEntryView, set: LiftSetView, change: Omit<EditLiftSetInput, "setId">, after?: () => void) {
    if (!lift) return;
    const sessionId = lift.id;
    setBusy(`set:${set.id}`);
    startTransition(async () => {
      const res = await call(() => actions.editLiftSet({ setId: set.id, ...change }));
      setBusy(null);
      if (!res.ok) {
        const why = res.error;
        setFix((f) => (f?.setId === set.id ? { ...f, error: why } : f));
        if (fix?.setId !== set.id) setError(why);
        after?.();
        return;
      }
      const s = res.value.set;
      const { jump, jumpLine } = res.value;
      editOverlay(sessionId, (o) => ({ ...o, edits: { ...o.edits, [s.id]: s } }));
      setFix((f) => (f?.setId === set.id ? null : f));
      const asks = !!jump && !!jumpLine && !bookWith(bookRef.current, s.id, e.movementKey, jump, jumpLine).answers[s.id];
      setBook((b) => bookWith(b, s.id, e.movementKey, jump, jumpLine));
      const m = resolve(e.movementKey);
      if (m) announce(`Changed to ${setLineOf(s, m, unit)}.${asks ? ` ${jumpLine}` : ""}`);
      after?.();
    });
  }

  function setKind(e: LiftEntryView, set: LiftSetView, option: SetKindOption, after?: () => void) {
    const others = e.sets.filter((s) => s.id !== set.id).map((s) => ({ ord: s.ord, kind: s.kind, chainOf: s.chainOf }));
    const next = withKindOption({ ord: set.ord, kind: set.kind, chainOf: set.chainOf, toFailure: set.toFailure, amrap: set.amrap, rir: set.rir }, option, others);
    setMenu(null);
    if (!next) {
      after?.();
      return;
    }
    edit(e, set, { kind: next.kind, chainOf: next.chainOf, toFailure: next.toFailure, amrap: next.amrap, rir: next.rir }, after);
  }

  function openFix(set: LiftSetView) {
    setMenu(null);
    setFix({ setId: set.id, weight: savedTextOf("weight", set, unit), reps: savedTextOf("reps", set, unit), sec: savedTextOf("sec", set, unit), dist: savedTextOf("dist", set, unit), error: null, armed: false });
  }

  function saveFix(e: LiftEntryView, set: LiftSetView) {
    const m = resolve(e.movementKey);
    if (!m || !fix || fix.setId !== set.id) return;
    const fields = rowFieldsOf(m, unit);
    const others = e.sets.filter((s) => s.id !== set.id).map((s) => ({ ord: s.ord, kind: s.kind, chainOf: s.chainOf }));
    const typed = rawOfValues(fixValuesOf(fix, m, unit), m, fields);
    // The weight as it was shown stands as stored (lb shows 100 kg as 220.5, which reads back as 100.02 kg).
    const keep = fixKeepsWeight(fix.weight, set, unit) && typed.weightKg !== undefined && set.weightKg != null;
    const raw = { ord: set.ord, kind: set.kind, chainOf: set.chainOf, rir: set.rir, toFailure: set.toFailure, amrap: set.amrap, ...typed, ...(keep ? { weightKg: set.weightKg } : {}) };
    const clean = cleanSetInput(raw, { movement: m, unit, others, bodyKg: e.bodyKg });
    if (!clean.ok) {
      const why = clean.error;
      setFix((f) => (f ? { ...f, error: why } : f));
      return;
    }
    const c = clean.value;
    edit(e, set, { weightKg: c.weightKg, reps: c.reps, durationSec: c.durationSec, distanceM: c.distanceM });
  }

  function deleteSet(e: LiftEntryView, set: LiftSetView) {
    if (!lift || !fix) return;
    if (!fix.armed) {
      setFix({ ...fix, armed: true });
      return;
    }
    const sessionId = lift.id;
    setBusy(`set:${set.id}`);
    startTransition(async () => {
      const res = await call(() => actions.deleteLiftSet(set.id));
      setBusy(null);
      if (!res.ok) {
        const why = res.error;
        setFix((f) => (f ? { ...f, error: why, armed: false } : f));
        return;
      }
      editOverlay(sessionId, (o) => ({ ...o, removedSets: [...o.removedSets, set.id] }));
      setFix(null);
      setBook((b) => ({ jumps: omit(b.jumps, set.id), answers: omit(b.answers, set.id) }));
      setTimer((t) => (t?.entryId === e.id && e.sets[e.sets.length - 1]?.id === set.id ? null : t));
      announce("Set deleted.");
    });
  }

  /** Keep: kept on this page for Finish (no column holds it), checked by the server against the set's jump. */
  function keep(set: LiftSetView) {
    setBook((b) => ({ ...b, answers: { ...b.answers, [set.id]: "KEPT" } }));
    startTransition(async () => {
      const res = await call(() => actions.confirmLiftSet({ setId: set.id, answer: "KEPT" }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const answer = res.value.answer;
      if (answer) setBook((b) => ({ ...b, answers: { ...b.answers, [set.id]: answer } }));
    });
  }

  // ── finish ──────────────────────────────────────────────────────────────
  function openFinish() {
    if (!lift) return;
    setMenu(null);
    setFix(null);
    setPicker(null);
    setArmed(null);
    // Counted to now (never before the last set: a phone's clock that ran behind would read 0 minutes).
    setFinish({ label: lift.label ?? "", minutes: "", rpe: null, countsAs: true, nowMs: Math.max(nowMs(), lastSetMsOf(lift) ?? 0) });
  }

  function finishNow() {
    if (!lift || !finish) return;
    // A set still on its way would be left out of the summary (or land after it): Finish waits (the button says so).
    if (lift.entries.some((x) => draftsFor(x).some((d) => d.saving))) return;
    const sessionId = lift.id;
    const label = finish.label.replace(/\s+/g, " ").trim();
    const typed = parseFigure(finish.minutes);
    if (typed != null && (Number.isNaN(typed) || typed < 0 || typed > 1440)) {
      setError("Minutes from 0 to 1,440, please.");
      return;
    }
    const ids = new Set(lift.entries.flatMap((x) => x.sets.map((s) => s.id)));
    const answers = Object.fromEntries(Object.entries(book.answers).filter(([k]) => ids.has(k)));
    const countsAs = link && finish.countsAs && lift.day === today ? link.templateId : null;
    setError(null);
    setBusy("finish");
    startTransition(async () => {
      const res = await call(() =>
        actions.finishLift({
          sessionId,
          ...(label !== (lift.label ?? "") ? { label: label === "" ? null : label } : {}),
          ...(finish.rpe != null ? { sessionRpe: finish.rpe } : {}),
          ...(typed != null ? { reportedMin: typed } : {}),
          answers,
          countsAs,
        })
      );
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setClosedIds((c) => [...c, sessionId]);
      resetFor(null);
      setBook((b) => ({ jumps: b.jumps, answers }));
      setFinished(res.value);
      announce(res.value.line);
    });
  }

  /** The summary's Keep or Confirm: Finish again (a replay writes nothing) with the answer, for the summary it gives. */
  function answerHeld(h: HeldJump) {
    if (!finished) return;
    const sessionId = finished.session.id;
    const answer: JumpAnswer = h.level === "DOUBLE" ? "CONFIRMED" : "KEPT";
    const answers = { ...book.answers, [h.setId]: answer };
    setBook((b) => ({ ...b, answers: { ...b.answers, [h.setId]: answer } }));
    setError(null);
    setBusy("held");
    startTransition(async () => {
      const res = await call(() => actions.finishLift({ sessionId, answers }));
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const v = res.value;
      setFinished((f) => (f && f.session.id === sessionId ? { ...f, summary: v.summary, moments: v.moments, held: v.held, records: v.records, lines: v.lines } : f));
      announce(v.moments.length > 0 ? `Counted: ${v.moments.length === 1 ? "a new best" : `${v.moments.length} new bests`}.` : "Kept.");
    });
  }

  function discard() {
    if (!lift) return;
    if (armed !== "discard") {
      setArmed("discard");
      return;
    }
    const sessionId = lift.id;
    setArmed(null);
    setBusy("discard");
    startTransition(async () => {
      const res = await call(() => actions.discardLift(sessionId));
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setClosedIds((c) => [...c, sessionId]);
      resetFor(null);
      setMessage(LIFT_COPY.DISCARDED);
      announce(LIFT_COPY.DISCARDED);
    });
  }

  // ── render ──────────────────────────────────────────────────────────────
  if (finished) {
    return (
      <div className="wt-lift">
        <LiftSummary
          finished={finished}
          answers={book.answers}
          busy={busy === "held"}
          error={error}
          onAnswer={answerHeld}
          onDone={() => {
            setFinished(null);
            setError(null);
            setMessage(null);
          }}
        />
      </div>
    );
  }

  if (!lift) {
    const closedNote = view.closed.some((c) => !c.discarded);
    return (
      <div className="wt-lift">
        {closedNote && <p className="t-meta wt-lift-msg">{LIFT_COPY.CLOSED}</p>}
        {message && <p className="t-meta wt-lift-msg">{message}</p>}
        {view.recent.length > 0 && (
          <ul className="wt-lift-repeat" aria-label="Repeat a lift">
            {view.recent.map((r) => (
              <li key={r.id}>
                <div className="wt-ex-opts">
                  <ChipButton onClick={() => start(r.id)} disabled={busy != null}>
                    {r.line}
                  </ChipButton>
                </div>
                <span className="t-meta">
                  {dayShortOf(r.day)}
                  {r.movements.length > 0 ? ` · ${r.movements.map((x) => x.name).join(", ")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button variant={view.recent.length > 0 ? "secondary" : "primary"} className="wt-log" onClick={() => start(null)} disabled={busy != null}>
          {view.recent.length > 0 ? "Start an empty lift" : LIFT_COPY.START}
        </Button>
        <p className="t-meta wt-ex-note">{LIFT_COPY.START_NOTE}</p>
        {error && (
          <p className="t-meta wt-msg" role="alert">
            {error}
          </p>
        )}
        <HardSetWeek id={`${id}-week`} tallies={view.week} />
      </div>
    );
  }

  const summary = sessionSummaryOf(lift, resolve);
  const startedAt = clockOf(lift.startedAt);
  const logged = lift.entries.reduce((n, e) => n + e.sets.length, 0);
  const warmups = summary.entries.reduce((n, e) => n + e.warmups, 0);
  const sofar = logged === 0 ? "No sets yet" : summary.workingSets > 0 || summary.reps > 0 ? totalsLineOf(summary, unit) : `${warmups} ${warmups === 1 ? "warm-up" : "warm-ups"}`;
  const inLift = new Set(lift.entries.map((e) => e.movementKey));
  const recentKeys = [...new Set([...view.recent.flatMap((r) => r.movements.map((x) => x.movementKey))])];
  const leftOut = lift.entries.some((e) => draftsFor(e).length > 0);
  const saving = lift.entries.some((e) => draftsFor(e).some((d) => d.saving));
  return (
    <div className="wt-lift">
      <div className="wt-lift-head">
        <h3 className="wt-lift-title">{lift.label ?? "Lift"}</h3>
        <p className="t-meta wt-lift-msg t-num">
          {[startedAt ? `Started ${startedAt}` : null, sofar].filter(Boolean).join(" · ")}
        </p>
      </div>
      {message && <p className="t-meta wt-lift-msg">{message}</p>}
      {lift.entries.length === 0 && <p className="t-meta wt-lift-msg">No movements yet. Add one to log its sets.</p>}
      {lift.entries.map((e) => {
        const m = resolve(e.movementKey);
        if (!m) return null;
        return (
          <LiftEntryBlock
            key={e.id}
            entry={e}
            m={m}
            history={view.history[e.movementKey]}
            drafts={draftsFor(e)}
            unit={unit}
            busy={busy}
            menu={menu}
            fix={fix}
            armed={armed === `remove:${e.id}`}
            book={book}
            timer={timer}
            recordsOpen={recordsOf === e.id}
            initialActive={initial?.active ?? null}
            focusedRow={focusedRow}
            autoFocusRow={autoFocusRow}
            on={{
              records: () => setRecordsOf((x) => (x === e.id ? null : e.id)),
              draftField: (key, field, value) => editDrafts(e, (rows) => rows.map((x) => (x.key === key ? { ...x, [field]: value, error: null } : x))),
              fixField: (field, value) => setFix((f) => (f ? { ...f, [field]: value, error: null, armed: false } : f)),
              log: (key) => log(e, key),
              plus: () => plus(e),
              drop: () => drop(e),
              menu: (rowKey) => setMenu((x) => (x === rowKey ? null : rowKey)),
              draftKind: (key, option) => draftKind(e, key, option),
              setKind: (set, option, after) => setKind(e, set, option, after),
              removeDraft: (key) => {
                editDrafts(e, (rows) => rows.filter((x) => x.key !== key));
                setMenu(null);
              },
              openFix,
              saveFix: (set) => saveFix(e, set),
              cancelFix: () => setFix(null),
              deleteSet: (set) => deleteSet(e, set),
              keep,
              jumpFix: openFix,
              skipRest: () => setTimer(null),
              removeEntry: () => removeEntry(e),
              focusRow: (key, field) => setFocusedRow((x) => (field ? key : x === key ? null : x)),
              autoFocused: () => setAutoFocusRow(null),
            }}
          />
        );
      })}
      {picker ? (
        <MovementPicker
          movements={movements}
          recentKeys={recentKeys}
          inLift={inLift}
          busy={busy === "add"}
          error={error}
          initialQuery={picker.query ?? ""}
          initialCreate={picker.create ?? null}
          onPick={pick}
          onCreate={createAndAdd}
          onClose={() => {
            setPicker(null);
            setError(null);
          }}
        />
      ) : (
        <div className="wt-lift-acts">
          <Button variant="secondary" icon="plus" onClick={() => setPicker({})} disabled={busy === "add"}>
            {LIFT_COPY.ADD}
          </Button>
          <Button variant="quiet" onClick={() => setPicker({ create: EMPTY_MOVEMENT })} disabled={busy === "add"}>
            New movement
          </Button>
        </div>
      )}
      {finish ? (
        <FinishPanel
          lift={lift}
          draft={finish}
          lastSetMs={lastSetMsOf(lift)}
          link={link && lift.day === today ? link : null}
          leftOut={leftOut}
          saving={saving}
          busy={busy === "finish" || busy === "discard"}
          error={error}
          discardArmed={armed === "discard"}
          onDraft={(patch) => setFinish((f) => (f ? { ...f, ...patch } : f))}
          onFinish={finishNow}
          onBack={() => {
            setFinish(null);
            setArmed(null);
            setError(null);
            requestAnimationFrame(() => document.getElementById(`${id}-finish`)?.focus());
          }}
          onDiscard={discard}
        />
      ) : (
        <>
          {error && !picker && (
            <p className="t-meta wt-msg" role="alert">
              {error}
            </p>
          )}
          <Button id={`${id}-finish`} variant="primary" className="wt-log" onClick={openFinish} disabled={busy != null || saving}>
            {LIFT_COPY.FINISH}
          </Button>
        </>
      )}
      <HardSetWeek id={`${id}-week`} tallies={view.week} />
    </div>
  );
}

