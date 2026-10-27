"use client";

/**
 * Train › Exercise: a walk, and (once the strength_sets migration is applied, view.kindsReady) every other kind as a
 * record (health-2026-10-27.md D10-D13, D23). Before MOMENTUM_LAUNCH_DAY a walk is a record, never a reward (no XP,
 * MP, streak or celebration), and the card is exactly that.
 *
 *   week     walking only: this week's walks, distance, time and climb. Every kind: the sessions, the time, the WHO
 *            effort minutes and strength days, and the kinds logged (ExerciseWeek.tsx), a record of the week
 *   kinds    a chip per kind (44 px); the walk form is the one it always was, LIFT is the set logger (LiftLogger:
 *            a record, D12, D14) once the lift tables are there (lift.ready; before them it says the logger is next,
 *            and a failed read says so), and every other kind takes SessionForm (a record: it pays nothing, and says
 *            so). An open lift opens the card on Lift; the logger stays mounted (hidden) while another kind is
 *            picked, so its rest timer, rows and Keep answers survive the switch. An "Again" chip fills the
 *            last session of the kind on today's date; a walk faster than a walk offers "Log it as a run?" (its
 *            angle goes over as the run's incline, and a run's incline back as the walk's angle)
 *   log      the incline angle in degrees (with quick chips and its treadmill grade), the distance, the duration and
 *            the day; a live line reads the speed, the pace and the climb before you save
 *   history  the last 90 days, newest first, each kind with its name and figures; Delete asks twice (a walk's takes
 *            its pay back the day it was logged; a record's paid nothing, and a habit it counted as stays ticked:
 *            its Sure? step and its delete line say so, from view.counted)
 *
 * On a live day (view.live; momentum.md §A.6, §E.4) the card only states what the server decided: the pay line
 * ("Paid +16.6 XP · moderate · 45 effort min", "Logged · walks pay only today or yesterday", "Recorded · faster than
 * a walk"), the paid XP as a T0 mark, and the server-returned Seals (a personal best) — nothing is priced here. The
 * form pre-selects "Counts as: <title>" when the server found an exercise habit due today; each paid walk shows its
 * XP, and Delete says whether it takes the pay back (logged today) or the pay stays.
 *
 * `actions` are the server actions (page) or fakes (fixtures); `initial` opens a fixture on a kind, a draft, a saved
 * line, More open or a row's Sure? step (and `initial.lift` the logger on a state). `lift` and `liftActions` are the
 * lift view and its actions (actions/training.ts), or fakes. Only the walk marks its paid XP; a record kind never
 * marks, chimes or enqueues, and neither does the lift logger.
 */
import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { addDays, type DayKey } from "@/lib/life-day";
import { announce, enqueue, mark } from "@/lib/celebrate";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import {
  ANGLE_MAX,
  EXERCISE_KINDS,
  EXERCISE_LABEL,
  KIND_SPECS,
  SESSION_RECORD_COPY,
  againDraftOf,
  asSessionView,
  cleanWalkInput,
  distanceLabelOf,
  durationLabel,
  factsPartsOf,
  kindOfferOf,
  paceLabel,
  recordDeleteNote,
  sessionDeleteLineOf,
  sessionDurationLabel,
  sessionRefusalOf,
  variantOptionOf,
  walkDeleteLine,
  walkDeleteNote,
  walkFactsOf,
  walkPayLine,
  xpText,
  type ExerciseKind,
  type ExerciseSessionView,
  type SessionView,
  type WalkDeleteOutcome,
  type WalkPay,
} from "@/lib/exercise";
import type { ExerciseView } from "@/lib/exercise-server";
import type { LiftView } from "@/lib/training-server";
import { SessionWeekSummary } from "./ExerciseWeek";
import { SessionForm, type FormKind, type LogSessionAction, type SessionDraft } from "./SessionForm";
import { LiftLogger, type LiftLoggerInitial } from "./LiftLogger";
import { LIFT_COPY, type LiftActions } from "./lift-model";

export interface ExerciseActions {
  logWalk: (input: {
    day?: string;
    angleDeg: number;
    distanceKm: number;
    durationMin: number;
    note?: string;
    countsAs?: string | null;
  }) => Promise<{ ok: true; value: ExerciseSessionView & { pay?: WalkPay; celebrations?: CelebrationEvent[] } } | { ok: false; error: string }>;
  deleteExercise: (id: string) => Promise<{ ok: true; value: WalkDeleteOutcome | null } | { ok: false; error: string }>;
  /** Every other kind (a record): actions/exercise.ts logSession. */
  logSession: LogSessionAction;
  /** A record's delete (nothing to take back): actions/exercise.ts deleteSession. */
  deleteSession: (id: string) => Promise<{ ok: true; value: null } | { ok: false; error: string }>;
}

/** A fixture's opening state: the kind picked, the form's draft, a saved line, More open, a row on its Sure? step. */
export interface ExerciseCardInitial {
  kind?: ExerciseKind;
  draft?: SessionDraft;
  saved?: string;
  more?: boolean;
  /** A listed session's id: its Delete opens on "Sure?". */
  confirm?: string;
  /** The lift logger's opening state. */
  lift?: LiftLoggerInitial;
}

/** The picker's words: one short word a kind. */
const KIND_CHIP: Readonly<Record<ExerciseKind, string>> = {
  WALK: "Walk",
  RUN: "Run",
  CYCLE: "Ride",
  SWIM: "Swim",
  ROW: "Row",
  ELLIPTICAL: "Elliptical",
  HIIT: "HIIT",
  CIRCUIT: "Circuit",
  SPORT: "Sport",
  YOGA: "Yoga",
  MOBILITY: "Mobility",
  LIFT: "Lift",
};

export const EXERCISE_NOT_READY_LINE = "Exercise logging needs a one-time database update first. Your entries can't be saved until then.";
const ANGLE_CHIPS = [0, 2, 5, 8, 12];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const num = (s: string): number => (s.trim() === "" ? Number.NaN : Number(s.replace(",", ".")));
const km = (v: number): string => `${v.toFixed(v < 10 ? 2 : 1).replace(/\.?0+$/, "")} km`;

/** A record session's row: its name (the user's, a sport's or a yoga style's, else the kind), then its figures. */
function recordRowOf(s: SessionView): { name: string; main: string; sub: string } {
  const option = variantOptionOf(s.kind, s.variant);
  const named = s.label ?? (s.kind === "SPORT" || s.kind === "YOGA" ? (option?.label ?? null) : null);
  const main = [s.distanceKm > 0 ? distanceLabelOf(s.kind, s.distanceKm) : null, sessionDurationLabel(s.kind, s.durationMin)].filter(Boolean).join(" · ");
  const sub = [
    named ? EXERCISE_LABEL[s.kind] : null,
    option && option.label !== named && option.key !== "OTHER" ? option.label : null,
    ...factsPartsOf(s),
    s.avgHr != null ? `avg HR ${s.avgHr}` : null,
    s.maxHr != null ? `max HR ${s.maxHr}` : null,
    s.sessionRpe != null ? `felt ${s.sessionRpe}/10` : null,
  ].filter((x): x is string => x != null);
  // Each figure stays whole on a narrow row ("2:08 /100 m", "avg HR 152"): lines break only between the parts.
  const whole = (x: string) => x.replace(/ /g, "\u00a0");
  return { name: named ?? EXERCISE_LABEL[s.kind], main: main.split(" · ").map(whole).join(" · "), sub: sub.map(whole).join(" · ") };
}

function dayWords(day: DayKey, today: DayKey): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  // Fixed words, never the runtime's locale (the server and the browser would differ).
  const [y, m, d] = day.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

export function ExerciseCard({
  view,
  actions,
  initial,
  lift = null,
  liftActions,
}: {
  view: ExerciseView;
  actions: ExerciseActions;
  initial?: ExerciseCardInitial;
  /** The lift logger's view (training-server loadLiftView); null or absent: Lift says the logger is next. */
  lift?: LiftView | null;
  liftActions?: LiftActions;
}) {
  const id = useId();
  const today = view.today;
  const kinds = view.kindsReady === true;
  const liftReady = kinds && lift != null && lift.ready && liftActions != null;
  const walkFirst = !initial?.kind || initial.kind === "WALK";
  const [kind, setKind] = useState<ExerciseKind>(kinds ? (initial?.kind ?? (liftReady && lift?.open ? "LIFT" : "WALK")) : "WALK");
  // The record form's draft and a counter that remounts it (a new kind picked, a draft carried over).
  const [seed, setSeed] = useState<{ n: number; draft?: SessionDraft; saved?: string }>({ n: 0, draft: initial?.draft, saved: initial?.saved });
  const [angle, setAngle] = useState(walkFirst && initial?.draft?.angle ? initial.draft.angle : "0");
  const [distance, setDistance] = useState(walkFirst ? (initial?.draft?.distance ?? "") : "");
  const [duration, setDuration] = useState(walkFirst ? (initial?.draft?.duration ?? "") : "");
  const [day, setDay] = useState<DayKey>(today);
  const [countsAs, setCountsAs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(walkFirst ? (initial?.saved ?? null) : null);
  const [confirm, setConfirm] = useState<string | null>(initial?.confirm ?? null);
  const [pending, start] = useTransition();
  const listed = useMemo(() => view.sessions.map(asSessionView), [view.sessions]);

  const draft = cleanWalkInput({ day, angleDeg: num(angle), distanceKm: num(distance), durationMin: num(duration) }, today);
  const preview = draft.ok ? walkFactsOf(draft.value) : null;
  const angleNum = num(angle);
  const grade = Number.isFinite(angleNum) && angleNum >= 0 && angleNum <= ANGLE_MAX ? walkFactsOf({ angleDeg: angleNum, distanceKm: 1, durationMin: 1 }).gradePct : null;
  // "Counts as" (live days only): the habit the server found due today, for a walk dated today.
  const link = view.live && view.link && day === today ? view.link : null;
  // Every kind: the walk's Again chip, and "Log it as a run?" for a walk faster than a walk (the walk's own refusal).
  const walkAgain = kinds ? againDraftOf(listed, "WALK", today) : null;
  const walkOffer = kinds && draft.ok ? kindOfferOf("WALK", sessionRefusalOf({ ...draft.value, kind: "WALK", poolM: null, avgWatts: null, variant: null })) : null;

  /** A kind picked: the walk form, or a fresh record form for it (the kind already picked keeps its form as it is). */
  function pick(k: ExerciseKind) {
    if (k === kind) return;
    setKind(k);
    setSeed((x) => ({ n: x.n + 1 }));
    setError(null);
    setSaved(null);
  }

  /** "Log it as a run?" / "Log it as a walk?": the same distance, time and day on the other kind's form. */
  function carry(k: ExerciseKind, d: SessionDraft) {
    setError(null);
    setSaved(null);
    if (k === "WALK") {
      setDistance(d.distance ?? "");
      setDuration(d.duration ?? "");
      // A run's incline is the walk's angle (above ANGLE_MAX the walk form says so in its own words).
      setAngle(d.angle && d.angle.trim() !== "" ? d.angle : "0");
      setDay(d.day ?? today);
      setKind("WALK");
      return;
    }
    setKind(k);
    setSeed((x) => ({ n: x.n + 1, draft: d }));
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(null);
    if (!draft.ok) {
      setError(draft.error);
      return;
    }
    setError(null);
    const v = draft.value;
    const from = e.currentTarget.querySelector(".wt-log");
    const linked = link && countsAs ? link.templateId : null;
    start(async () => {
      const res = await actions.logWalk({ day: v.day, angleDeg: v.angleDeg, distanceKm: v.distanceKm, durationMin: v.durationMin, ...(linked ? { countsAs: linked } : {}) });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const pay = res.value.pay;
      if (pay) {
        // A live day: say what the server paid, mark the paid XP (T0), then its Seals (a personal best).
        const line = walkPayLine(pay);
        setSaved(line);
        if (pay.kind === "PAID" && pay.xp > 0) {
          void mark({ kind: "tick", id: `walk:${res.value.id}`, text: `Walked ${km(v.distanceKm)} · paid ${xpText(pay.xp)} XP exactly`, amount: { kind: "xp", value: pay.xp }, from, say: false });
        }
        announce(line);
        for (const ev of res.value.celebrations ?? []) if (ev.tier >= 2) enqueue(ev);
      } else {
        const said = `Logged a ${km(v.distanceKm)} walk, ${durationLabel(v.durationMin)} at ${v.angleDeg}°.`;
        setSaved(said);
        announce(said);
      }
      setDistance("");
      setDuration("");
      setDay(today);
    });
  }

  function remove(s: ExerciseSessionView) {
    if (confirm !== s.id) {
      setConfirm(s.id);
      return;
    }
    start(async () => {
      // A record paid nothing: its own delete, the row alone. A walk's may take its pay back.
      if (s.kind !== "WALK") {
        const res = await actions.deleteSession(s.id);
        setConfirm(null);
        if (!res.ok) setError(res.error);
        // A habit it counted as stays ticked (its own Undo is on Today): the line says so.
        else announce(sessionDeleteLineOf(s.kind, view.live ? (view.counted?.[s.id] ?? null) : null));
        return;
      }
      const res = await actions.deleteExercise(s.id);
      setConfirm(null);
      if (!res.ok) setError(res.error);
      else announce(walkDeleteLine(res.value));
    });
  }

  const w = view.week;
  const walkForm = (
    <form className="wt-ex-form" onSubmit={submit} noValidate>
      {walkAgain && (
        <div className="wt-ex-opts" role="group" aria-label="Again">
          <ChipButton
            onClick={() => {
              setAngle(String(walkAgain.draft.angleDeg));
              setDistance(String(walkAgain.draft.distanceKm));
              setDuration(String(Math.round(walkAgain.draft.durationMin * 10) / 10));
              setDay(today);
              setError(null);
              setSaved(null);
            }}
            disabled={pending}
          >
            {walkAgain.line}
          </ChipButton>
        </div>
      )}
      <div className="wt-ex-grid">
        <label className="wt-ex-f">
          <span className="wt-label">Angle (°)</span>
          <input className="wt-input" inputMode="decimal" value={angle} onChange={(e) => setAngle(e.currentTarget.value)} aria-describedby={`${id}-grade`} disabled={pending} />
        </label>
        <label className="wt-ex-f">
          <span className="wt-label">Distance (km)</span>
          <input className="wt-input" inputMode="decimal" placeholder="3.5" value={distance} onChange={(e) => setDistance(e.currentTarget.value)} disabled={pending} />
        </label>
        <label className="wt-ex-f">
          <span className="wt-label">Duration (min)</span>
          <input className="wt-input" inputMode="decimal" placeholder="45" value={duration} onChange={(e) => setDuration(e.currentTarget.value)} disabled={pending} />
        </label>
        <label className="wt-ex-f">
          <span className="wt-label">Day</span>
          <input className="wt-input" type="date" value={day} max={today} min={addDays(today, -365)} onChange={(e) => setDay(e.currentTarget.value || today)} disabled={pending} />
        </label>
      </div>
      <div className="wt-ex-chips" role="group" aria-label="Quick angle">
        {ANGLE_CHIPS.map((a) => (
          <ChipButton key={a} pressed={angleNum === a} onClick={() => setAngle(String(a))} disabled={pending}>
            {a === 0 ? "Flat" : `${a}°`}
          </ChipButton>
        ))}
      </div>
      <p id={`${id}-grade`} className="t-meta wt-ex-line">
        {grade != null ? (grade === 0 ? "Flat ground" : `≈ ${grade}% treadmill grade`) : `An angle from 0° to ${ANGLE_MAX}°`}
        {preview && ` · ${preview.speedKmh} km/h · ${paceLabel(preview.paceMinPerKm)}${preview.climbM > 0 ? ` · climb ${preview.climbM} m` : ""}`}
      </p>
      {walkOffer && (
        <div className="wt-ex-opts" role="group" aria-label="Another kind">
          <ChipButton onClick={() => carry(walkOffer.kind, { day, distance, duration, angle: num(angle) > 0 ? angle : "" })} disabled={pending}>
            {walkOffer.line}
          </ChipButton>
        </div>
      )}
      {link && (
        <div className="wt-ex-chips" role="group" aria-label="Counts as">
          <ChipButton pressed={countsAs} onClick={() => setCountsAs((c) => !c)} disabled={pending}>
            Counts as: {link.title}
          </ChipButton>
        </div>
      )}
      <Button type="submit" variant="primary" className="wt-log" disabled={pending}>
        Log walk
      </Button>
      {error && (
        <p className="t-meta wt-msg" role="alert">
          {error}
        </p>
      )}
      {saved && <p className="t-meta wt-msg">{saved}</p>}
    </form>
  );

  return (
    <section className="card pad-l wt-ex-card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="t-eyebrow wt-eyebrow">
        {kinds ? "Exercise" : "Walking"}
      </h2>
      {kinds ? (
        <SessionWeekSummary sessions={view.sessions} today={today} />
      ) : (
        <>
          <dl className="wt-ex-week" aria-label="This week">
            <div>
              <dt>Walks</dt>
              <dd>{w.sessions}</dd>
            </div>
            <div>
              <dt>Distance</dt>
              <dd>{km(w.distanceKm)}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{durationLabel(w.durationMin)}</dd>
            </div>
            <div>
              <dt>Climb</dt>
              <dd>{w.climbM} m</dd>
            </div>
          </dl>
          <p className="t-meta wt-ex-week-l">This week, from Monday.</p>
        </>
      )}

      {!view.ready && <p className="t-meta wt-ex-warn">{EXERCISE_NOT_READY_LINE}</p>}

      {kinds && (
        <div className="wt-ex-kinds" role="group" aria-label="Kind of exercise">
          {EXERCISE_KINDS.map((k) => (
            <ChipButton key={k} pressed={kind === k} onClick={() => pick(k)} disabled={pending}>
              {KIND_CHIP[k]}
            </ChipButton>
          ))}
        </div>
      )}

      {kind === "WALK" ? (
        walkForm
      ) : kind === "LIFT" ? (
        liftReady ? null : <p className="t-meta wt-ex-note">{lift?.failed ? LIFT_COPY.NOT_LOADED : SESSION_RECORD_COPY.LIFT_NEXT}</p>
      ) : (
        <SessionForm
          key={`${kind}:${seed.n}`}
          kind={kind as FormKind}
          today={today}
          sessions={listed}
          link={view.live ? (view.link ?? null) : null}
          logSession={actions.logSession}
          initial={seed.draft}
          saved={seed.saved ?? null}
          onOffer={carry}
          disabled={pending}
          more={seed.n === 0 && initial?.more === true}
        />
      )}
      {liftReady && lift && liftActions && (
        <div hidden={kind !== "LIFT"}>
          <LiftLogger view={lift} today={today} link={view.live ? (view.link ?? null) : null} actions={liftActions} initial={initial?.lift} />
        </div>
      )}
      {kind !== "WALK" && error && (
        <p className="t-meta wt-msg" role="alert">
          {error}
        </p>
      )}

      <div className="wt-hist">
        <h3 className="t-eyebrow">{kinds ? "Recent sessions" : "Recent walks"}</h3>
        {view.sessions.length === 0 ? (
          <p className="t-meta wt-empty">{kinds ? "No sessions yet. Log your first one above." : "No walks yet. Log your first one above."}</p>
        ) : (
          <ul className="wt-list">
            {listed.map((s) => {
              if (s.kind !== "WALK") {
                const r = recordRowOf(s);
                const noun = KIND_SPECS[s.kind].noun;
                const counted = view.live ? view.counted?.[s.id] : undefined;
                return (
                  <li key={s.id} className="wt-item wt-ex-item">
                    <span className="wt-ex-item-day">{dayWords(s.day, today)}</span>
                    <span className="wt-ex-item-main">
                      <span>
                        <b>{r.name}</b> · {r.main}
                      </span>
                      {r.sub && <span className="t-meta wt-ex-item-sub">{r.sub}</span>}
                      {counted && confirm === s.id && <span className="t-meta wt-ex-item-sub">{recordDeleteNote(counted)}</span>}
                    </span>
                    <Button variant="quiet" disabled={pending} onClick={() => remove(s)} aria-label={confirm === s.id ? `Tap again to delete this ${noun}` : `Delete this ${noun}`}>
                      {confirm === s.id ? "Sure?" : "Delete"}
                    </Button>
                  </li>
                );
              }
              const f = walkFactsOf(s);
              const paid = view.live ? view.paid?.[s.id] : undefined;
              return (
                <li key={s.id} className="wt-item wt-ex-item">
                  <span className="wt-ex-item-day">{dayWords(s.day, today)}</span>
                  <span className="wt-ex-item-main">
                    <span>
                      <b>{km(s.distanceKm)}</b> · {durationLabel(s.durationMin)} · {s.angleDeg}°
                    </span>
                    <span className="t-meta wt-ex-item-sub">
                      {f.speedKmh} km/h · {paceLabel(f.paceMinPerKm)}
                      {f.climbM > 0 ? ` · climb ${f.climbM} m` : ""}
                      {paid ? ` · +${xpText(paid.xp)} XP` : ""}
                    </span>
                    {paid && confirm === s.id && <span className="t-meta wt-ex-item-sub">{walkDeleteNote(paid)}</span>}
                  </span>
                  <Button variant="quiet" disabled={pending} onClick={() => remove(s)} aria-label={confirm === s.id ? "Tap again to delete this walk" : "Delete this walk"}>
                    {confirm === s.id ? "Sure?" : "Delete"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
