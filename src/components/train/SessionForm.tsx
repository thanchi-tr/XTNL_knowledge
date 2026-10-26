"use client";

/**
 * Train › Exercise: the form for every kind but a walk and a lift (health-2026-10-27.md D10-D13; health-brief
 * §3.1, §3.5). A RECORD until SESSION_PAY_LAUNCH_DAY: the form says so, prices nothing, and states only what the
 * server returned (exercise.ts sessionLoggedLineOf). It never marks, chimes or enqueues: a record has no XP and no
 * moments of its own (the walk's one mark stays ExerciseCard's).
 *
 *   again    one tap: the last session of this kind on today's date ("Again: 5 km · 27 min"), then Log
 *   fields   what KIND_SPECS asks for: the distance (km, or m for a swim and a row, where '1,500' is 1500; a swim in
 *            a pool takes lengths), the duration (minutes, or m:ss on a text keyboard, so ':' can be typed), the day,
 *            the kind's variant (chips; a sport from a list), a ride's watts; behind More (open on a fixture's
 *            `more`): the name, the incline, the heart rates, "How hard was it?" (0-10, a record only)
 *   live     the derived figures before you save (a clock-typed time read back, '8 min 10 s'; pace and speed, a swim's
 *            pace per 100 m and lengths, a row's split and watts), why it would not count ('under 5 minutes'), and
 *            "Log it as a walk?" for a run at a walking pace (its time carried as minutes, its incline as the angle)
 *   link     "Counts as: <habit>" pre-selected when the server found a personal exercise habit due today: the
 *            habit's own tick, at its usual price, and said when the draft would not count; nothing else here pays.
 *            With no habit to tick, the note says a record counts only when linked (LINK_HINT, D12)
 *
 * Each save carries its own clientId, so a retried tap answers the row the first one wrote.
 */
import { useId, useState, useTransition, type FormEvent } from "react";
import { addDays, type DayKey } from "@/lib/life-day";
import { announce } from "@/lib/celebrate";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import {
  KIND_SPECS,
  SESSION_LIMITS,
  SESSION_RECORD_COPY,
  againDraftOf,
  cleanSessionInput,
  distanceLabelOf,
  factsPartsOf,
  kindOfferOf,
  sessionLoggedLineOf,
  sessionRefusalLineOf,
  sessionRefusalOf,
  type ExerciseKind,
  type SessionInput,
  type SessionView,
} from "@/lib/exercise";
import type { ExerciseResult, LoggedSession } from "@/lib/exercise-server";

/** What the form sends (actions/exercise.ts LogSessionInput takes it): numbers as typed, checked again on the server. */
export interface SessionSend {
  kind: string;
  day?: string;
  durationMin?: number;
  distanceKm?: number;
  distanceM?: number;
  lengths?: number;
  poolM?: number;
  angleDeg?: number;
  variant?: string;
  label?: string;
  avgWatts?: number;
  avgHr?: number;
  maxHr?: number;
  sessionRpe?: number;
  clientId?: string;
  countsAs?: string | null;
}

export type LogSessionAction = (input: SessionSend) => Promise<ExerciseResult<LoggedSession>>;

/** The form's fields as typed: the distance in the kind's own unit (km, or m for a swim and a row). */
export interface SessionDraft {
  day?: DayKey;
  duration?: string;
  distance?: string;
  angle?: string;
  variant?: string | null;
  label?: string;
  poolM?: string;
  lengths?: string;
  avgWatts?: string;
  avgHr?: string;
  maxHr?: string;
  rpe?: number | null;
}

/** The kinds this form logs. */
export type FormKind = Exclude<ExerciseKind, "WALK" | "LIFT">;

/** The draft's typed text fields. */
type TextKey = Exclude<keyof SessionDraft, "day" | "variant" | "rpe">;

const PLACEHOLDER: Partial<Record<ExerciseKind, { distance?: string; duration: string }>> = {
  RUN: { distance: "5", duration: "27" },
  CYCLE: { distance: "20", duration: "45" },
  SWIM: { distance: "1000", duration: "30" },
  ROW: { distance: "2000", duration: "8:10" },
};
const POOL_CHIPS = [25, 50];
const RPE_CHIPS = Array.from({ length: SESSION_LIMITS.RPE_MAX - SESSION_LIMITS.RPE_MIN + 1 }, (_, i) => SESSION_LIMITS.RPE_MIN + i);

const num = (s: string): number => (s.trim() === "" ? Number.NaN : Number(s.replace(",", ".")));
/** An optional field: left out when blank (the core then stores nothing), else its number (NaN is refused there). */
const opt = (s: string | undefined): number | undefined => (s == null || s.trim() === "" ? undefined : num(s));
const GROUPED = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
/** Metres or a count as typed: '1,500' is 1500 (the app writes metres that way); else as num() ('1,5' is 1.5). */
const wholeNum = (s: string): number => (GROUPED.test(s.trim()) ? Number(s.trim().replace(/,/g, "")) : num(s));
const optWhole = (s: string | undefined): number | undefined => (s == null || s.trim() === "" ? undefined : wholeNum(s));
const trimmed = (v: number, places: number): string => String(Math.round(v * 10 ** places) / 10 ** places);

/** Minutes from '27', '27.5', '8:10' (m:ss) or '1:05:30' (h:mm:ss); NaN when it is none of them. */
export function minutesOf(s: string): number {
  const t = s.trim();
  if (t === "") return Number.NaN;
  const clock = /^(?:(\d+):)?(\d+):([0-5]\d)$/.exec(t);
  if (clock) return (clock[1] ? Number(clock[1]) * 60 : 0) + Number(clock[2]) + Number(clock[3]) / 60;
  return num(t);
}

/** '8 min 10 s', '1 h 05 min 30 s': a clock-typed duration read back, so '1:05' is seen as 1 min 05 s. */
function clockEchoOf(min: number): string {
  const sec = Math.round(min * 60);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = String(sec % 60).padStart(2, "0");
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min${sec % 60 ? ` ${ss} s` : ""}` : `${m} min ${ss} s`;
}

/** '27' or '8:10': a duration back into the field (whole seconds as m:ss). */
function durationText(min: number): string {
  const sec = Math.round(min * 60);
  return sec % 60 === 0 ? String(sec / 60) : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** The form's fields for a stored session's inputs (the Again chip, a carried-over draft). */
export function draftOfSession(kind: ExerciseKind, s: Pick<SessionInput, "day" | "distanceKm" | "durationMin" | "angleDeg" | "variant" | "label" | "poolM" | "avgWatts">): SessionDraft {
  const spec = KIND_SPECS[kind];
  const metres = spec.distanceUnit === "m";
  const pool = spec.poolLength && s.poolM != null ? s.poolM : null;
  return {
    day: s.day,
    duration: durationText(s.durationMin),
    distance: s.distanceKm > 0 ? (metres ? trimmed(s.distanceKm * 1000, 0) : trimmed(s.distanceKm, 2)) : "",
    angle: s.angleDeg > 0 ? String(s.angleDeg) : "",
    variant: s.variant,
    label: s.label ?? "",
    poolM: pool != null ? trimmed(pool, 2) : "",
    lengths: pool != null && s.distanceKm > 0 ? String(Math.round((s.distanceKm * 1000) / pool)) : "",
    avgWatts: s.avgWatts != null ? String(s.avgWatts) : "",
  };
}

/** The draft as the core reads it (cleanSessionInput): a pool's lengths when a pool is set, else the distance. */
function rawOf(kind: FormKind, d: Required<SessionDraft>, today: DayKey): SessionSend {
  const spec = KIND_SPECS[kind];
  const raw: SessionSend = { kind, day: d.day || today, durationMin: minutesOf(d.duration) };
  const pooled = spec.poolLength && d.poolM.trim() !== "";
  if (pooled) raw.poolM = num(d.poolM);
  if (spec.distance) {
    if (pooled) raw.lengths = optWhole(d.lengths);
    else if (spec.distanceUnit === "m") raw.distanceM = optWhole(d.distance);
    else raw.distanceKm = opt(d.distance);
  }
  if (spec.angleMax != null) raw.angleDeg = opt(d.angle);
  if (spec.variant && d.variant) raw.variant = d.variant;
  if (spec.nameHint != null && d.label.trim() !== "") raw.label = d.label;
  if (spec.watts) raw.avgWatts = opt(d.avgWatts);
  if (spec.heartRate) {
    raw.avgHr = opt(d.avgHr);
    raw.maxHr = opt(d.maxHr);
  }
  if (spec.rpe && d.rpe != null) raw.sessionRpe = d.rpe;
  return raw;
}

const EMPTY: Required<SessionDraft> = { day: "", duration: "", distance: "", angle: "", variant: null, label: "", poolM: "", lengths: "", avgWatts: "", avgHr: "", maxHr: "", rpe: null };

/** A draft's given fields only (a key passed as undefined keeps the field as it was). */
const given = (d: SessionDraft | undefined): SessionDraft => Object.fromEntries(Object.entries(d ?? {}).filter(([, x]) => x !== undefined)) as SessionDraft;

const newClientId = (): string => globalThis.crypto?.randomUUID?.() ?? `c${Date.now().toString(36)}${Math.floor(performance.now() * 1000).toString(36)}`;

export function SessionForm({
  kind,
  today,
  sessions,
  link,
  logSession,
  initial,
  saved: savedAtFirst = null,
  onOffer,
  disabled = false,
  more = false,
}: {
  kind: FormKind;
  today: DayKey;
  /** Every listed session (the Again chip reads the latest of this kind). */
  sessions: readonly SessionView[];
  /** The personal EXERCISE habit due today and not done (a live day), or null. */
  link: { templateId: string; title: string } | null;
  logSession: LogSessionAction;
  initial?: SessionDraft;
  /** A fixture's saved line, shown at first. */
  saved?: string | null;
  /** "Log it as a walk?": the card switches to the walk form with this draft. */
  onOffer?: (kind: ExerciseKind, draft: SessionDraft) => void;
  disabled?: boolean;
  /** A fixture's More, open at first (the name, incline, heart rates and "How hard"). */
  more?: boolean;
}) {
  const id = useId();
  const spec = KIND_SPECS[kind];
  const metres = spec.distanceUnit === "m";
  const [f, setF] = useState<Required<SessionDraft>>(() => ({ ...EMPTY, day: today, variant: spec.variant?.fallback ?? null, ...given(initial) }));
  const [countsAs, setCountsAs] = useState(true);
  const [clientId, setClientId] = useState(newClientId);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(savedAtFirst);
  const [pending, start] = useTransition();
  const busy = pending || disabled;
  const set = (patch: Partial<SessionDraft>) => setF((d) => ({ ...d, ...patch }));

  const raw = rawOf(kind, f, today);
  const draft = cleanSessionInput(raw, today);
  const value = draft.ok ? draft.value : null;
  const parts = value ? factsPartsOf(value) : [];
  const pooled = spec.poolLength && f.poolM.trim() !== "";
  // A time typed as a clock is read back ('1:05' is 1 min 05 s, never 1 h 05 min).
  if (value && f.duration.includes(":")) parts.unshift(clockEchoOf(value.durationMin));
  if (value && pooled && value.distanceKm > 0) parts.unshift(`= ${distanceLabelOf(kind, value.distanceKm)}`);
  const refusal = value ? sessionRefusalOf(value) : null;
  const offer = value ? kindOfferOf(kind, refusal) : null;
  // Why it would not count, before it is saved: the refusal without its after-save "Recorded · ".
  const live = [...parts, ...(offer ? ["a walking pace"] : refusal ? [sessionRefusalLineOf(kind, refusal).replace(/^Recorded · /, "")] : [])];
  const again = againDraftOf(sessions, kind, today);
  // "Counts as" (live days only): the habit the server found due today, for a session dated today.
  const linked = link && f.day === today ? link : null;
  const counting = linked != null && countsAs;
  const ph = PLACEHOLDER[kind] ?? { duration: "45" };

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(null);
    // A pool's swim is counted in lengths (the core would ask for the metres).
    if (pooled && f.lengths.trim() === "") {
      setError("How many lengths, please.");
      return;
    }
    if (!draft.ok) {
      setError(draft.error);
      return;
    }
    setError(null);
    const countsAsId = linked && countsAs ? linked.templateId : null;
    start(async () => {
      const res = await logSession({ ...raw, clientId, ...(countsAsId ? { countsAs: countsAsId } : {}) });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const line = sessionLoggedLineOf(res.value, res.value.refusal, res.value.link);
      setSaved(line);
      announce(line);
      setClientId(newClientId());
      setF((d) => ({ ...EMPTY, day: today, variant: d.variant, poolM: d.poolM }));
    });
  }

  const field = (label: string, key: TextKey, o: { placeholder?: string; mode?: "decimal" | "numeric" | "text"; wide?: boolean } = {}) => (
    <label className={o.wide ? "wt-ex-f wt-ex-wide" : "wt-ex-f"}>
      <span className="wt-label">{label}</span>
      <input className="wt-input" inputMode={o.mode ?? "decimal"} placeholder={o.placeholder} value={f[key]} onChange={(e) => set({ [key]: e.currentTarget.value } as Partial<SessionDraft>)} disabled={busy} />
    </label>
  );

  const v = spec.variant;
  return (
    <form className="wt-ex-form" onSubmit={submit} noValidate aria-label={`Log ${/^[aeiou]/i.test(spec.noun) ? "an" : "a"} ${spec.noun}`}>
      {again && (
        <div className="wt-ex-opts" role="group" aria-label="Again">
          <ChipButton
            onClick={() => {
              setF({ ...EMPTY, ...given(draftOfSession(kind, again.draft)), day: today });
              setError(null);
              setSaved(null);
            }}
            disabled={busy}
          >
            {again.line}
          </ChipButton>
        </div>
      )}
      <div className="wt-ex-grid">
        {/* A long list (a sport) leads, across the row: it is what the session is. */}
        {v && v.options.length > 5 && (
          <label className="wt-ex-f wt-ex-wide">
            <span className="wt-label">{v.label}</span>
            <select className="wt-input" value={f.variant ?? ""} onChange={(e) => set({ variant: e.currentTarget.value || null })} disabled={busy}>
              <option value="">Pick a {v.noun}</option>
              {v.options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "SPORT" && f.variant === "OTHER" && field("Which sport", "label", { placeholder: spec.nameHint ?? "", wide: true, mode: "text" })}
        {spec.poolLength && field("Pool (m)", "poolM", { placeholder: "25" })}
        {spec.distance && (pooled ? field("Lengths", "lengths", { placeholder: "40", mode: "numeric" }) : field(metres ? "Distance (m)" : "Distance (km)", "distance", { placeholder: ph.distance, mode: metres ? "numeric" : "decimal" }))}
        {/* A text keyboard: a phone's decimal pad has no ':' for an m:ss time. */}
        {field("Duration (min)", "duration", { placeholder: ph.duration, mode: "text" })}
        <label className="wt-ex-f">
          <span className="wt-label">Day</span>
          <input className="wt-input" type="date" value={f.day} max={today} min={addDays(today, -365)} onChange={(e) => set({ day: e.currentTarget.value || today })} disabled={busy} />
        </label>
        {spec.watts && kind === "CYCLE" && field("Avg watts", "avgWatts", { placeholder: "150", mode: "numeric" })}
      </div>
      {spec.poolLength && (
        <div className="wt-ex-opts" role="group" aria-label="Pool length">
          {POOL_CHIPS.map((p) => (
            <ChipButton key={p} pressed={num(f.poolM) === p} onClick={() => set({ poolM: String(p) })} disabled={busy}>
              {p} m pool
            </ChipButton>
          ))}
          <ChipButton pressed={f.poolM.trim() === ""} onClick={() => set({ poolM: "", lengths: "" })} disabled={busy}>
            Open water
          </ChipButton>
        </div>
      )}
      {v && v.options.length <= 5 && (
        <div className="wt-ex-f">
          <span className="wt-label" id={`${id}-v`}>
            {v.label}
            {v.need === "OPTIONAL" ? " (optional)" : ""}
          </span>
          <div className="wt-ex-opts" role="group" aria-labelledby={`${id}-v`}>
            {v.options.map((o) => (
              <ChipButton
                key={o.key}
                pressed={f.variant === o.key}
                onClick={() => set({ variant: f.variant === o.key && v.need === "OPTIONAL" ? null : o.key })}
                disabled={busy}
              >
                {o.label}
              </ChipButton>
            ))}
          </div>
        </div>
      )}
      {live.length > 0 && <p className="t-meta wt-ex-line">{live.join(" · ")}</p>}
      {offer && onOffer && (
        <div className="wt-ex-opts" role="group" aria-label="Another kind">
          <ChipButton
            onClick={() => {
              // The walk form reads minutes only (its parsing stays as it is): an m:ss time goes over as minutes, to 0.1.
              const m = minutesOf(f.duration);
              onOffer(offer.kind, { day: f.day, distance: f.distance, duration: Number.isFinite(m) ? String(Math.round(m * 10) / 10) : f.duration, angle: f.angle });
            }}
            disabled={busy}
          >
            {offer.line}
          </ChipButton>
        </div>
      )}

      <details className="wt-ex-more" open={more || undefined}>
        <summary>More: {[spec.nameHint != null && !(kind === "SPORT" && f.variant === "OTHER") ? "name" : null, spec.angleMax != null ? "incline" : null, spec.watts && kind !== "CYCLE" ? "watts" : null, spec.heartRate ? "heart rate" : null, spec.rpe ? "how hard" : null].filter(Boolean).join(", ")}</summary>
        <div className="wt-ex-more-body">
          <div className="wt-ex-grid">
            {spec.nameHint != null && !(kind === "SPORT" && f.variant === "OTHER") && field("Name (optional)", "label", { placeholder: spec.nameHint, mode: "text" })}
            {spec.angleMax != null && field("Incline (°)", "angle", { placeholder: "0" })}
            {spec.watts && kind !== "CYCLE" && field("Avg watts", "avgWatts", { placeholder: "180", mode: "numeric" })}
            {spec.heartRate && field("Avg heart rate", "avgHr", { placeholder: "140", mode: "numeric" })}
            {spec.heartRate && field("Max heart rate", "maxHr", { placeholder: "170", mode: "numeric" })}
          </div>
          {spec.rpe && (
            <div className="wt-ex-f">
              <span className="wt-label" id={`${id}-rpe`}>
                How hard was it? (0 to 10, a record only)
              </span>
              <div className="wt-ex-opts wt-ex-rpe" role="group" aria-labelledby={`${id}-rpe`}>
                {RPE_CHIPS.map((r) => (
                  <ChipButton key={r} pressed={f.rpe === r} onClick={() => set({ rpe: f.rpe === r ? null : r })} disabled={busy}>
                    {r}
                  </ChipButton>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>

      {linked && (
        <div className="wt-ex-opts" role="group" aria-label="Counts as">
          <ChipButton pressed={countsAs} onClick={() => setCountsAs((c) => !c)} disabled={busy}>
            Counts as: {linked.title}
          </ChipButton>
        </div>
      )}
      <p className="t-meta wt-ex-note">
        {counting ? (refusal ? SESSION_RECORD_COPY.NOTE_REFUSED : SESSION_RECORD_COPY.NOTE_LINKED) : refusal ? SESSION_RECORD_COPY.NOTE : `${SESSION_RECORD_COPY.NOTE} ${SESSION_RECORD_COPY.LINK_HINT}.`}
      </p>
      <Button type="submit" variant="primary" className="wt-log" disabled={busy}>
        Log {spec.noun}
      </Button>
      {error && (
        <p className="t-meta wt-msg" role="alert">
          {error}
        </p>
      )}
      {saved && <p className="t-meta wt-msg">{saved}</p>}
    </form>
  );
}
