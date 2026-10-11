"use client";

/**
 * Train › Exercise: walking for now. Before MOMENTUM_LAUNCH_DAY a record, never a reward (no XP, MP, streak or
 * celebration), and the card is exactly that.
 *
 *   week     this week's sessions, distance, time and climb
 *   log      the incline angle in degrees (with quick chips and its treadmill grade), the distance, the duration and
 *            the day; a live line reads the speed, the pace and the climb before you save
 *   history  the last 90 days, newest first; Delete asks twice
 *
 * On a live day (view.live; momentum.md §A.6, §E.4) the card only states what the server decided: the pay line
 * ("Paid +16.6 XP · moderate · 45 effort min", "Logged · walks pay only today or yesterday", "Recorded · faster than
 * a walk"), the paid XP as a T0 mark, and the server-returned Seals (a personal best) — nothing is priced here. The
 * form pre-selects "Counts as: <title>" when the server found an exercise habit due today; each paid walk shows its
 * XP, and Delete says whether it takes the pay back (logged today) or the pay stays.
 *
 * `actions` are the server actions (page) or fakes (fixtures).
 */
import { useId, useState, useTransition, type FormEvent } from "react";
import { addDays, type DayKey } from "@/lib/life-day";
import { announce, enqueue, mark } from "@/lib/celebrate";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import {
  ANGLE_MAX,
  cleanWalkInput,
  durationLabel,
  paceLabel,
  walkDeleteLine,
  walkDeleteNote,
  walkFactsOf,
  walkPayLine,
  xpText,
  type ExerciseSessionView,
  type WalkDeleteOutcome,
  type WalkPay,
} from "@/lib/exercise";
import type { ExerciseView } from "@/lib/exercise-server";

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
}

export const EXERCISE_NOT_READY_LINE = "Exercise logging needs a one-time database update first. Your entries can't be saved until then.";
const ANGLE_CHIPS = [0, 2, 5, 8, 12];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const num = (s: string): number => (s.trim() === "" ? Number.NaN : Number(s.replace(",", ".")));
const km = (v: number): string => `${v.toFixed(v < 10 ? 2 : 1).replace(/\.?0+$/, "")} km`;

function dayWords(day: DayKey, today: DayKey): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  // Fixed words, never the runtime's locale (the server and the browser would differ).
  const [y, m, d] = day.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

export function ExerciseCard({ view, actions }: { view: ExerciseView; actions: ExerciseActions }) {
  const id = useId();
  const today = view.today;
  const [angle, setAngle] = useState("0");
  const [distance, setDistance] = useState("");
  const [duration, setDuration] = useState("");
  const [day, setDay] = useState<DayKey>(today);
  const [countsAs, setCountsAs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const draft = cleanWalkInput({ day, angleDeg: num(angle), distanceKm: num(distance), durationMin: num(duration) }, today);
  const preview = draft.ok ? walkFactsOf(draft.value) : null;
  const angleNum = num(angle);
  const grade = Number.isFinite(angleNum) && angleNum >= 0 && angleNum <= ANGLE_MAX ? walkFactsOf({ angleDeg: angleNum, distanceKm: 1, durationMin: 1 }).gradePct : null;
  // "Counts as" (live days only): the habit the server found due today, for a walk dated today.
  const link = view.live && view.link && day === today ? view.link : null;

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
      const res = await actions.deleteExercise(s.id);
      setConfirm(null);
      if (!res.ok) setError(res.error);
      else announce(walkDeleteLine(res.value));
    });
  }

  const w = view.week;
  return (
    <section className="card pad-l wt-ex-card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="t-eyebrow wt-eyebrow">
        Walking
      </h2>
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

      {!view.ready && <p className="t-meta wt-ex-warn">{EXERCISE_NOT_READY_LINE}</p>}

      <form className="wt-ex-form" onSubmit={submit} noValidate>
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

      <div className="wt-hist">
        <h3 className="t-eyebrow">Recent walks</h3>
        {view.sessions.length === 0 ? (
          <p className="t-meta wt-empty">No walks yet. Log your first one above.</p>
        ) : (
          <ul className="wt-list">
            {view.sessions.map((s) => {
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
