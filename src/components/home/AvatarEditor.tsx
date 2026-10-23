"use client";

/**
 * Edit avatar (blueprint P4; decisions D3 and D4): the Status card's sheet for the desired self in numbers. It lists
 * the live targets by attribute (each its line, "Weight 82.4 → 75 kg · 38% of the way · on pace"), and adds, edits,
 * archives and logs them. The numbers are the user's own (D4: entered after ship); nothing here pays, and the sheet
 * says so. The weight target is Body's weight card's own (WeightGoal, on Body › This week): it is listed with a way
 * there, never a second form.
 *
 * An edit archives the old row and adds a new one (avatar-server editAvatarTargetCore), so the history stays; an
 * archive asks once more. A target of your own takes a reading for today. The actions come in as props (the page
 * passes the server actions in src/app/actions/avatar.ts), so the sheet imports no server module. On a server whose
 * writes are off (a dev server sharing the database) the sheet says nothing will be recorded, and Save answers so.
 *
 * <AvatarFields/> is the sheet's body, exported so a check can render it (the Sheet renders nothing until it opens).
 * Its fields are study.css's (.st-input and its labels), which the /you layout loads: the sheet imports no CSS, so a
 * check can import it.
 */
import { useId, useState, useTransition, type FormEvent } from "react";
import { addDays, type DayKey } from "@/lib/life-day";
import {
  AVATAR_ATTRIBUTES,
  AVATAR_ATTRIBUTE_NAME,
  AVATAR_METRICS,
  AVATAR_PER_ATTRIBUTE_MAX,
  AVATAR_TARGETS_MAX,
  LABEL_MAX,
  MANUAL_UNIT_MAX,
  WEIGHT_PLACE,
  formatValue,
  metricsFor,
  type AvatarAttribute,
  type AvatarResult,
  type AvatarTargetInput,
  type AvatarTargetPatch,
  type AvatarTargetView,
  type AvatarView,
  type StoredMetric,
} from "@/lib/avatar";
import { announce } from "@/lib/celebrate";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";

/** The sheet's writes (src/app/actions/avatar.ts), passed in by the page. */
export interface AvatarActions {
  addAvatarTarget: (input: AvatarTargetInput, opts?: { refresh?: boolean }) => Promise<AvatarResult<{ id: string }>>;
  editAvatarTarget: (id: string, patch: AvatarTargetPatch, opts?: { refresh?: boolean }) => Promise<AvatarResult<{ id: string }>>;
  archiveAvatarTarget: (id: string, opts?: { refresh?: boolean }) => Promise<AvatarResult<null>>;
  logAvatarReading: (id: string, value: number, opts?: { refresh?: boolean }) => Promise<AvatarResult<{ day: DayKey; value: number }>>;
}

const REFRESH = { refresh: true };

/** The sheet's title and its one line. */
export const AVATAR_SHEET_TITLE = "Edit avatar";
export const AVATAR_SHEET_SUB = "The desired self, in numbers. Targets pay nothing.";
export const AVATAR_WRITES_OFF_NOTE = "This server records nothing: avatar changes are recorded only on the live app.";
/** Where the weight target is set: Body's weight card (WEIGHT_PLACE, Body › This week). */
export const WEIGHT_HREF = "/train";

/** A number as typed ("1,240", "$12,400", "82.4"), or null. */
export function parseFigure(text: string): number | null {
  const s = text.replace(/[\s,$]/g, "");
  if (s === "" || !/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A value as the form prefills it (no grouping, so it parses back). */
const plain = (v: number | null, places: number) => (v == null ? "" : String(Math.round(v * 10 ** places) / 10 ** places));

export function AvatarEditor({ view, today, actions }: { view: AvatarView; today: DayKey; actions: AvatarActions }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="av-open">
        <Button variant="secondary" icon="flag" onClick={() => setOpen(true)} aria-haspopup="dialog">
          {AVATAR_SHEET_TITLE}
        </Button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={AVATAR_SHEET_TITLE} description={AVATAR_SHEET_SUB}>
        {open && <AvatarFields view={view} today={today} actions={actions} />}
      </Sheet>
    </>
  );
}

type Mode = { kind: "list" } | { kind: "add" } | { kind: "edit"; id: string } | { kind: "log"; id: string };

/** The sheet's body. `initial` opens a page other than the list (a fixture or a check drawing the add form). */
export function AvatarFields({ view, today, actions, initial = "list" }: { view: AvatarView; today: DayKey; actions: AvatarActions; initial?: "list" | "add" }) {
  const [mode, setMode] = useState<Mode>({ kind: initial });
  const back = () => setMode({ kind: "list" });
  const target = mode.kind === "edit" || mode.kind === "log" ? view.targets.find((t) => t.id === mode.id) : undefined;
  return (
    <div className="av-sheet">
      {!view.writesOn && <p className="st-note av-off">{AVATAR_WRITES_OFF_NOTE}</p>}
      {mode.kind === "list" && <TargetList view={view} actions={actions} onAdd={() => setMode({ kind: "add" })} onEdit={(id) => setMode({ kind: "edit", id })} onLog={(id) => setMode({ kind: "log", id })} />}
      {mode.kind === "add" && <AddForm view={view} today={today} actions={actions} onDone={back} />}
      {mode.kind === "edit" && target && <EditForm target={target} today={today} actions={actions} onDone={back} />}
      {mode.kind === "log" && target && <LogForm target={target} actions={actions} onDone={back} />}
    </div>
  );
}

function TargetList({
  view,
  actions,
  onAdd,
  onEdit,
  onLog,
}: {
  view: AvatarView;
  actions: AvatarActions;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onLog: (id: string) => void;
}) {
  const [armed, setArmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const full = view.targets.length >= AVATAR_TARGETS_MAX;

  function archive(t: AvatarTargetView) {
    if (armed !== t.id) {
      setArmed(t.id);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await actions.archiveAvatarTarget(t.id, REFRESH);
      setArmed(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      announce(`${t.label} archived.`);
    });
  }

  return (
    <div className="av-list">
      {view.targets.length === 0 && <p className="st-note">No targets yet. Give an attribute a number to aim for: where you are, where you want to be, and by when.</p>}
      {AVATAR_ATTRIBUTES.map((a) => {
        const mine = view.targets.filter((t) => t.attribute === a);
        if (mine.length === 0) return null;
        return (
          <section key={a} className="av-group" aria-label={AVATAR_ATTRIBUTE_NAME[a]}>
            <h3 className="st-label">{AVATAR_ATTRIBUTE_NAME[a]}</h3>
            {mine.map((t) => (
              <div key={t.id} className="av-item">
                <p className="av-line">{t.line}</p>
                <div className="st-row">
                  {t.editable ? (
                    <>
                      <Button variant="quiet" onClick={() => onEdit(t.id)} disabled={pending} aria-label={`Edit ${t.label}`}>
                        Edit
                      </Button>
                      {t.metric === "MANUAL" && (
                        <Button variant="quiet" onClick={() => onLog(t.id)} disabled={pending} aria-label={`Log ${t.label}`}>
                          Log
                        </Button>
                      )}
                      <Button variant={armed === t.id ? "secondary" : "quiet"} onClick={() => archive(t)} onBlur={() => setArmed(null)} disabled={pending} aria-label={armed === t.id ? `Archive it? ${t.label}` : `Archive ${t.label}`}>
                        {armed === t.id ? "Archive it?" : "Archive"}
                      </Button>
                    </>
                  ) : (
                    <Button variant="quiet" href={WEIGHT_HREF}>
                      Set on {WEIGHT_PLACE}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </section>
        );
      })}
      {error && (
        <p role="alert" className="st-error">
          {error}
        </p>
      )}
      <div className="st-row">
        <Button variant="primary" onClick={onAdd} disabled={pending || full}>
          Add a target
        </Button>
      </div>
      <p className="st-note">
        {full ? `${AVATAR_TARGETS_MAX} targets is the most; archive one to add another.` : `Up to ${AVATAR_PER_ATTRIBUTE_MAX} for each attribute. An edit keeps the old version as history.`}
      </p>
    </div>
  );
}

/** The add form: an attribute, what measures it, a name, where you are, where you want to be, and by when. */
function AddForm({ view, today, actions, onDone }: { view: AvatarView; today: DayKey; actions: AvatarActions; onDone: () => void }) {
  const id = useId();
  const [attribute, setAttribute] = useState<AvatarAttribute>("VITALITY");
  const offered = metricsFor(attribute);
  const [metricPick, setMetric] = useState<StoredMetric | "WEIGHT">(offered[0]);
  const metric: StoredMetric | "WEIGHT" = metricPick === "WEIGHT" && attribute === "VITALITY" ? "WEIGHT" : metricPick !== "WEIGHT" && offered.includes(metricPick) ? metricPick : offered[0];
  const [fieldId, setFieldId] = useState(view.fields[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("");
  const [direction, setDirection] = useState<"UP" | "DOWN">("UP");
  const [baseline, setBaseline] = useState("");
  const [targetText, setTarget] = useState("");
  const [day, setDay] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const spec = AVATAR_METRICS[metric];
  const field = view.fields.find((f) => f.id === fieldId);
  const namePlaceholder = metric === "FIELD_LEVEL" ? (field ? `${field.name} level` : "A Field's level") : spec.label || "Pull-ups, pages, savings…";

  function save(e: FormEvent) {
    e.preventDefault();
    if (metric === "WEIGHT") return;
    const t = parseFigure(targetText);
    if (t === null) {
      setError("The target isn't a number.");
      return;
    }
    const b = baseline.trim() === "" ? null : parseFigure(baseline);
    if (baseline.trim() !== "" && b === null) {
      setError("The baseline isn't a number.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await actions.addAvatarTarget(
        {
          attribute,
          metric,
          label: label.trim() || null,
          fieldId: metric === "FIELD_LEVEL" ? fieldId : null,
          unit: metric === "MANUAL" ? unit : null,
          direction: metric === "MANUAL" ? direction : null,
          baseline: b,
          target: t,
          targetDay: day || null,
        },
        REFRESH
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      announce("Target added.");
      onDone();
    });
  }

  return (
    <form className="av-form" onSubmit={save} noValidate>
      <label htmlFor={`${id}-a`} className="st-label">
        Attribute
      </label>
      <select id={`${id}-a`} className="st-input" value={attribute} onChange={(e) => setAttribute(e.target.value as AvatarAttribute)} disabled={pending} data-autofocus>
        {AVATAR_ATTRIBUTES.map((a) => (
          <option key={a} value={a}>
            {AVATAR_ATTRIBUTE_NAME[a]}
            {a === "CAPITAL" ? " (a reading only)" : ""}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-m`} className="st-label">
        Measured by
      </label>
      <select id={`${id}-m`} className="st-input" value={metric} onChange={(e) => setMetric(e.target.value as StoredMetric | "WEIGHT")} disabled={pending} aria-describedby={`${id}-mh`}>
        {attribute === "VITALITY" && <option value="WEIGHT">{AVATAR_METRICS.WEIGHT.name}</option>}
        {offered.map((m) => (
          <option key={m} value={m}>
            {AVATAR_METRICS[m].name}
          </option>
        ))}
      </select>
      <p id={`${id}-mh`} className="st-hint">
        Reads {spec.reads}.
      </p>
      {metric === "WEIGHT" ? (
        <div className="st-row">
          <Button variant="secondary" href={WEIGHT_HREF}>
            Set it on {WEIGHT_PLACE}
          </Button>
        </div>
      ) : (
        <>
          {metric === "FIELD_LEVEL" && (
            <>
              <label htmlFor={`${id}-f`} className="st-label">
                Field
              </label>
              {view.fields.length > 0 ? (
                <select id={`${id}-f`} className="st-input" value={fieldId} onChange={(e) => setFieldId(e.target.value)} disabled={pending}>
                  {view.fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} (level {formatValue(f.level, "level", 1)})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="st-note">No Fields yet.</p>
              )}
            </>
          )}
          <label htmlFor={`${id}-n`} className="st-label">
            Name
          </label>
          <input id={`${id}-n`} className="st-input" type="text" maxLength={LABEL_MAX} autoComplete="off" value={label} placeholder={namePlaceholder} onChange={(e) => setLabel(e.target.value)} disabled={pending} />
          {metric === "MANUAL" && (
            <>
              <label htmlFor={`${id}-u`} className="st-label">
                Unit (optional)
              </label>
              <input id={`${id}-u`} className="st-input" type="text" maxLength={MANUAL_UNIT_MAX} autoComplete="off" value={unit} placeholder="reps, pages, km" onChange={(e) => setUnit(e.target.value)} disabled={pending} />
              <fieldset className="av-dir">
                <legend className="st-label">Closer is</legend>
                <div className="st-row">
                  {(["UP", "DOWN"] as const).map((d) => (
                    <Button key={d} type="button" variant={direction === d ? "secondary" : "quiet"} aria-pressed={direction === d} onClick={() => setDirection(d)} disabled={pending}>
                      {d === "UP" ? "Higher" : "Lower"}
                    </Button>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          <Figures
            id={id}
            unit={spec.unit ?? unit}
            baseline={baseline}
            onBaseline={setBaseline}
            target={targetText}
            onTarget={setTarget}
            day={day}
            onDay={setDay}
            today={today}
            baselineHint={spec.source === "COMPUTED" ? "Leave it empty to start from where you are now." : "Where you are now (optional: it sets the share of the way)."}
            pending={pending}
          />
          {error && (
            <p role="alert" className="st-error">
              {error}
            </p>
          )}
          <div className="st-row">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="quiet" onClick={onDone} disabled={pending}>
              Cancel
            </Button>
          </div>
        </>
      )}
      {metric === "WEIGHT" && (
        <div className="st-row">
          <Button type="button" variant="quiet" onClick={onDone}>
            Back
          </Button>
        </div>
      )}
    </form>
  );
}

/** The baseline, the target and the day, in the target's unit. */
function Figures({
  id,
  unit,
  baseline,
  onBaseline,
  target,
  onTarget,
  day,
  onDay,
  today,
  baselineHint,
  pending,
}: {
  id: string;
  unit: string;
  baseline: string;
  onBaseline: (v: string) => void;
  target: string;
  onTarget: (v: string) => void;
  day: string;
  onDay: (v: string) => void;
  today: DayKey;
  baselineHint: string;
  pending: boolean;
}) {
  const tag = unit && unit !== "level" ? (unit === "AUD" ? "$" : unit) : null;
  return (
    <>
      <label htmlFor={`${id}-b`} className="st-label">
        Baseline
      </label>
      <div className="av-field">
        <input id={`${id}-b`} className="st-input num" type="text" inputMode="decimal" autoComplete="off" value={baseline} onChange={(e) => onBaseline(e.target.value)} aria-describedby={`${id}-bh`} disabled={pending} />
        {tag && <span className="av-unit" aria-hidden="true">{tag}</span>}
      </div>
      <p id={`${id}-bh`} className="st-hint">
        {baselineHint}
      </p>
      <label htmlFor={`${id}-t`} className="st-label">
        Target
      </label>
      <div className="av-field">
        <input id={`${id}-t`} className="st-input num" type="text" inputMode="decimal" autoComplete="off" value={target} onChange={(e) => onTarget(e.target.value)} disabled={pending} />
        {tag && <span className="av-unit" aria-hidden="true">{tag}</span>}
      </div>
      <label htmlFor={`${id}-d`} className="st-label">
        By (optional)
      </label>
      <input id={`${id}-d`} className="st-input" type="date" min={addDays(today, 1)} value={day} onChange={(e) => onDay(e.target.value)} aria-describedby={`${id}-dh`} disabled={pending} />
      <p id={`${id}-dh`} className="st-hint">
        With a day, the line says whether you are on pace.
      </p>
    </>
  );
}

/** The edit form: the name, the baseline, the target and the day. What it measures stays. */
function EditForm({ target, today, actions, onDone }: { target: AvatarTargetView; today: DayKey; actions: AvatarActions; onDone: () => void }) {
  const id = useId();
  const places = AVATAR_METRICS[target.metric].places;
  const [label, setLabel] = useState(target.label);
  const [baseline, setBaseline] = useState(plain(target.baseline, places));
  const [targetText, setTarget] = useState(plain(target.target, places));
  const [day, setDay] = useState(target.targetDay ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: FormEvent) {
    e.preventDefault();
    const t = parseFigure(targetText);
    if (t === null) {
      setError("The target isn't a number.");
      return;
    }
    const b = baseline.trim() === "" ? null : parseFigure(baseline);
    if (baseline.trim() !== "" && b === null) {
      setError("The baseline isn't a number.");
      return;
    }
    const patch: AvatarTargetPatch = {};
    if (label.trim() !== target.label) patch.label = label;
    if (b !== target.baseline) patch.baseline = b;
    if (t !== target.target) patch.target = t;
    if ((day || null) !== target.targetDay) patch.targetDay = day || null;
    setError(null);
    startTransition(async () => {
      const res = await actions.editAvatarTarget(target.id, patch, REFRESH);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      announce(`${label.trim() || target.label} saved.`);
      onDone();
    });
  }

  return (
    <form className="av-form" onSubmit={save} noValidate>
      <p className="st-note">
        {AVATAR_ATTRIBUTE_NAME[target.attribute]} · {AVATAR_METRICS[target.metric].name}
      </p>
      <label htmlFor={`${id}-n`} className="st-label">
        Name
      </label>
      <input id={`${id}-n`} className="st-input" type="text" maxLength={LABEL_MAX} autoComplete="off" value={label} onChange={(e) => setLabel(e.target.value)} disabled={pending} data-autofocus />
      <Figures
        id={id}
        unit={target.unit}
        baseline={baseline}
        onBaseline={setBaseline}
        target={targetText}
        onTarget={setTarget}
        day={day}
        onDay={setDay}
        today={today}
        baselineHint="Changing it starts the share of the way from today."
        pending={pending}
      />
      {error && (
        <p role="alert" className="st-error">
          {error}
        </p>
      )}
      <div className="st-row">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="quiet" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** A reading for a target of your own, for today (logging again today replaces it). */
function LogForm({ target, actions, onDone }: { target: AvatarTargetView; actions: AvatarActions; onDone: () => void }) {
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: FormEvent) {
    e.preventDefault();
    const v = parseFigure(text);
    if (v === null) {
      setError("That isn't a number.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await actions.logAvatarReading(target.id, v, REFRESH);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      announce(`${target.label}: ${formatValue(v, target.unit, AVATAR_METRICS.MANUAL.places)} logged.`);
      onDone();
    });
  }

  return (
    <form className="av-form" onSubmit={save} noValidate>
      <p className="av-line">{target.line}</p>
      <label htmlFor={`${id}-v`} className="st-label">
        Today&apos;s {target.label}
      </label>
      <div className="av-field">
        <input id={`${id}-v`} className="st-input num" type="text" inputMode="decimal" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} aria-describedby={`${id}-h`} disabled={pending} data-autofocus />
        {target.unit && <span className="av-unit" aria-hidden="true">{target.unit}</span>}
      </div>
      <p id={`${id}-h`} className="st-hint">
        Self-reported. Logging again today replaces today&apos;s.
      </p>
      {error && (
        <p role="alert" className="st-error">
          {error}
        </p>
      )}
      <div className="st-row">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Log it"}
        </Button>
        <Button type="button" variant="quiet" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
