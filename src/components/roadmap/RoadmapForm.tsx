"use client";

/**
 * /you/roadmap/new, the intake (lane R5; F2; final-roadmap-new.html). The
 * Form template: one column at most 640 wide, 16 px inputs under 600 px, and
 * a sticky submit (.add-sticky's pattern) that is never a dead button.
 *
 *   Aim (verbatim, never rewritten) · Area (one of the user's Fields with its
 *   real level and cards, "New Field…" after a confirm, or a life track for a
 *   practice-only aim; the model never picks it) · Practices count toward ·
 *   Domains you already have (each with its real cards and count at level
 *   6+) · By when (35 days to 3 years) · Hours a week (beside what the app
 *   has tracked) · Where you're starting (with the cards' truth under it) ·
 *   How hard · New cards a week (only with no measured pace) · Reality check ·
 *   Constraints · Exam · Official syllabus · Advanced (include practices, the
 *   privacy line from the pack's sections, the free-tier line).
 *
 * With a key: [Draft with Gemini] and [Build from my numbers]. Without one:
 * [Build from my numbers] and [Write it myself] with "Gemini isn't set up on
 * this server — the checks and measures still run." The unsent form survives
 * in guarded localStorage (never in the URL); an open DRAFT is edited, not
 * duplicated ("Continuing your draft from 3 Oct · Discard it").
 */
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { Icon, Sigil } from "@/components/ui/Icon";
import { Segmented, Switch } from "@/components/ui/Tabs";
import { Sheet } from "@/components/ui/Sheet";
import { pushToast } from "@/components/ui/toast-store";
import { ActionError } from "@/components/home/ActionError";
import { addDays, daysBetween } from "@/lib/life-day";
import type { Track } from "@/lib/life-types";
import {
  AIM_MAX,
  CONSTRAINTS_MAX,
  DEFAULT_FIELD_TRACK,
  DEFAULT_INTENSITY,
  EXAM_MAX,
  HOURS_MAX,
  HOURS_MIN,
  INTENSITIES,
  NEW_CARDS_PER_WEEK_MAX,
  NEW_CARDS_PER_WEEK_MIN,
  PACK_SECTIONS,
  ROADMAP_TRACKS,
  SOURCE_NOTE_MAX,
  SPAN_MAX_DAYS,
  SPAN_MIN_DAYS,
  START_POINTS,
  SYLLABUS_LINE_MAX,
  SYLLABUS_MAX_LINES,
  TYPICAL_HOURS_MAX,
  TYPICAL_HOURS_MIN,
  milestoneCountFor,
  type Intake,
  type IntakeFieldOption,
  type IntakeView,
  type Intensity,
  type StartPoint,
} from "@/lib/roadmap-types";
import {
  FREE_TIER_LINE,
  INTENSITY_WORD,
  NO_KEY_LINE,
  START_POINT_WORD,
  TRACK_SIGIL,
  TRACK_WORD,
  addMonths,
  count,
  dayLabel,
  dayWithWeekday,
  hoursLabel,
  intensityHint,
  plural,
  privacyLine,
} from "./roadmap-copy";
import { ROADMAP_HREF } from "./roadmap-links";
import { useRoadmapRuntime } from "./roadmap-runtime";
import { GlyphButton, RoadmapGlyph } from "./RoadmapGlyph";
import "@/components/library/study.css";
import "./roadmap.css";

/** Where the unsent form waits (guarded: storage may be off or full; never in the URL). */
export const INTAKE_STORAGE_KEY = "xtnl:roadmap:intake";

/** The form's state: the Intake plus the text fields as typed. */
export interface IntakeDraft {
  aim: string;
  fieldId: string | null;
  /** A life-track Area (fieldId null): its track. */
  areaTrack: Track | null;
  track: Track;
  domainIds: string[];
  targetDay: string;
  hours: string;
  startPoint: StartPoint;
  intensity: Intensity;
  newCards: string;
  typicalHours: string;
  typicalSource: string;
  constraints: string;
  exam: string;
  syllabus: string;
  syllabusSource: string;
  practicesAllowed: boolean;
}

export function emptyIntakeDraft(today: string): IntakeDraft {
  return {
    aim: "",
    fieldId: null,
    areaTrack: null,
    track: DEFAULT_FIELD_TRACK,
    domainIds: [],
    targetDay: addMonths(today, 6),
    hours: "5",
    startPoint: "BASICS",
    intensity: DEFAULT_INTENSITY,
    newCards: "",
    typicalHours: "",
    typicalSource: "",
    constraints: "",
    exam: "",
    syllabus: "",
    syllabusSource: "",
    practicesAllowed: true,
  };
}

/** A saved Intake back into the form. */
export function draftOfIntake(i: Intake): IntakeDraft {
  return {
    aim: i.aim,
    fieldId: i.fieldId,
    areaTrack: i.fieldId ? null : i.track,
    track: i.track,
    domainIds: [...i.domainIds],
    targetDay: i.targetDay,
    hours: String(i.hoursPerWeek),
    startPoint: i.startPoint,
    intensity: i.intensity,
    newCards: i.newCardsPerWeek != null ? String(i.newCardsPerWeek) : "",
    typicalHours: i.typicalHours != null ? String(i.typicalHours) : "",
    typicalSource: i.typicalHoursSource ?? "",
    constraints: i.constraints ?? "",
    exam: i.examLabel ?? "",
    syllabus: i.syllabus?.lines.join("\n") ?? "",
    syllabusSource: i.syllabus?.source ?? "",
    practicesAllowed: i.practicesAllowed,
  };
}

export type IntakeField = "aim" | "area" | "targetDay" | "hours" | "newCards" | "typicalHours" | "typicalSource" | "constraints" | "exam" | "syllabus";

/** The client's checks (the server re-validates every field). Returns the Intake, or the first problem per field. */
export function intakeOf(d: IntakeDraft, today: string): { intake: Intake | null; problems: Partial<Record<IntakeField, string>> } {
  const problems: Partial<Record<IntakeField, string>> = {};
  const aim = d.aim.replace(/\s+/g, " ").trim();
  if (!aim) problems.aim = "Say what you want to be able to do.";
  else if (aim.length > AIM_MAX) problems.aim = `At most ${AIM_MAX} characters.`;
  if (!d.fieldId && !d.areaTrack) problems.area = "Pick the Area this grows: one of your Fields, or a life track.";
  const span = /^\d{4}-\d{2}-\d{2}$/.test(d.targetDay) ? daysBetween(today, d.targetDay) : NaN;
  if (!Number.isFinite(span)) problems.targetDay = "Pick a date.";
  else if (span < SPAN_MIN_DAYS) problems.targetDay = "Too short for a roadmap — capture it as a goal on Today.";
  else if (span > SPAN_MAX_DAYS) problems.targetDay = "Set where you want to be in 3 years; planning further out comes later.";
  const hours = Number(d.hours);
  if (!Number.isInteger(hours) || hours < HOURS_MIN || hours > HOURS_MAX) problems.hours = `A whole number of hours, ${HOURS_MIN} to ${HOURS_MAX}.`;
  let newCards: number | null = null;
  if (d.newCards.trim()) {
    newCards = Number(d.newCards);
    if (!Number.isInteger(newCards) || newCards < NEW_CARDS_PER_WEEK_MIN || newCards > NEW_CARDS_PER_WEEK_MAX) problems.newCards = `A whole number, ${NEW_CARDS_PER_WEEK_MIN} to ${NEW_CARDS_PER_WEEK_MAX}, or leave it blank.`;
  }
  let typical: number | null = null;
  if (d.typicalHours.trim()) {
    typical = Number(d.typicalHours);
    if (!Number.isInteger(typical) || typical < TYPICAL_HOURS_MIN || typical > TYPICAL_HOURS_MAX) problems.typicalHours = `A whole number of hours, ${TYPICAL_HOURS_MIN} to ${TYPICAL_HOURS_MAX}, or leave it blank.`;
  }
  if (d.typicalSource.length > SOURCE_NOTE_MAX) problems.typicalSource = `At most ${SOURCE_NOTE_MAX} characters.`;
  if (d.constraints.length > CONSTRAINTS_MAX) problems.constraints = `At most ${CONSTRAINTS_MAX} characters.`;
  if (d.exam.length > EXAM_MAX) problems.exam = `At most ${EXAM_MAX} characters.`;
  const lines = d.syllabus
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (lines.length > SYLLABUS_MAX_LINES) problems.syllabus = `At most ${SYLLABUS_MAX_LINES} lines.`;
  else if (lines.some((l) => l.length > SYLLABUS_LINE_MAX)) problems.syllabus = `Each line at most ${SYLLABUS_LINE_MAX} characters.`;
  else if (d.syllabusSource.length > SOURCE_NOTE_MAX) problems.syllabus = `The source at most ${SOURCE_NOTE_MAX} characters.`;
  if (Object.keys(problems).length > 0) return { intake: null, problems };
  const trackArea = !d.fieldId;
  return {
    intake: {
      aim,
      fieldId: d.fieldId,
      track: trackArea ? (d.areaTrack as Track) : d.track,
      domainIds: trackArea ? [] : d.domainIds,
      targetDay: d.targetDay,
      hoursPerWeek: hours,
      newCardsPerWeek: newCards,
      typicalHours: typical,
      typicalHoursSource: typical != null && d.typicalSource.trim() ? d.typicalSource.trim() : null,
      syllabus: lines.length > 0 ? { lines, source: d.syllabusSource.trim() || null } : null,
      startPoint: d.startPoint,
      intensity: d.intensity,
      practicesAllowed: trackArea ? true : d.practicesAllowed,
      constraints: d.constraints.trim() || null,
      examLabel: d.exam.trim() || null,
    },
    problems,
  };
}

/** Whether "New cards a week" is asked: a Field Area whose chosen Domains and Field have no measured pace. */
export function asksNewCards(field: IntakeFieldOption | null, domainIds: readonly string[]): boolean {
  if (!field || field.paceMeasured) return false;
  return !field.domains.some((d) => domainIds.includes(d.id) && d.paceMeasured);
}

/** "The app splits this into 6 milestones of 10–11 weeks." (an estimate of the split code makes; Sundays decide it). */
export function splitHint(today: string, targetDay: string): string | null {
  const span = daysBetween(today, targetDay);
  if (!Number.isFinite(span) || span < SPAN_MIN_DAYS || span > SPAN_MAX_DAYS) return null;
  const n = milestoneCountFor(span);
  const lo = Math.max(5, Math.floor(span / n / 7));
  const hi = Math.max(lo, Math.ceil(span / n / 7));
  const weeks = lo === hi ? `${lo} weeks` : `${lo}–${hi} weeks`;
  return n === 1 ? `The app makes this one milestone of about ${weeks}, ending on your date.` : `The app splits this into ${n} milestones of about ${weeks}. Each ends on a Sunday; the last ends on your date.`;
}

/** A stored form worth restoring: one the user actually filled (an aim, an Area or Domains), never an untouched one. */
export function restorableIntake(v: unknown): v is IntakeDraft {
  if (!v || typeof v !== "object") return false;
  const d = v as Partial<IntakeDraft>;
  if (typeof d.aim !== "string") return false;
  return d.aim.trim().length > 0 || Boolean(d.fieldId) || Boolean(d.areaTrack) || (Array.isArray(d.domainIds) && d.domainIds.length > 0);
}

function readStored(): IntakeDraft | null {
  try {
    const raw = window.localStorage.getItem(INTAKE_STORAGE_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return restorableIntake(v) ? v : null;
  } catch {
    return null;
  }
}

function writeStored(d: IntakeDraft | null) {
  try {
    if (d) window.localStorage.setItem(INTAKE_STORAGE_KEY, JSON.stringify(d));
    else window.localStorage.removeItem(INTAKE_STORAGE_KEY);
  } catch {
    // Storage off or full: the form still works; nothing is lost from the screen.
  }
}

type Path = "GEMINI" | "STARTER" | "MANUAL";

/** The on-screen keyboard's height (visualViewport), so the sticky submit rides on it (AddIdeaForm's pattern). */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

function AreaSheet({
  open,
  onClose,
  fields,
  draft,
  onPickField,
  onPickTrack,
}: {
  open: boolean;
  onClose: () => void;
  fields: readonly IntakeFieldOption[];
  draft: IntakeDraft;
  onPickField: (f: IntakeFieldOption) => void;
  onPickTrack: (t: Track) => void;
}) {
  const runtime = useRoadmapRuntime();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    const n = name.replace(/\s+/g, " ").trim();
    if (!n) return setError("Name the Field first.");
    setBusy(true);
    setError(null);
    try {
      const res = await runtime.actions.createField(n);
      if (res.ok) {
        setNaming(false);
        setName("");
        pushToast({ title: "Field created", body: `${res.value.name} is one of your Fields now. Pick it below once the page refreshes.` });
        runtime.refresh();
      } else setError(res.error);
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Area — what this grows" description="Progress is measured in the Area you pick. Gemini never picks it.">
      <div className="t-eyebrow rm-sheet-eyebrow" style={{ marginTop: 0 }}>
        Your Fields
      </div>
      <div className="rm-pick-list">
        {fields.map((f) => (
          <button key={f.id} type="button" className="rm-pick" aria-pressed={draft.fieldId === f.id} onClick={() => onPickField(f)}>
            <Sigil track="know" />
            <span className="rm-pick-t">
              <b>{f.name}</b>
              <span className="t-meta">
                level {f.level} · {plural(f.cards, "card")}
                {f.inMaintenance ? " · This Field is excused from quotas and Boss" : ""}
              </span>
            </span>
            {draft.fieldId === f.id && <Icon name="check" />}
          </button>
        ))}
        <button type="button" className="rm-pick" onClick={() => setNaming(true)} aria-expanded={naming}>
          <Icon name="plus" />
          <span className="rm-pick-t">
            <b>New Field…</b>
            <span className="t-meta">asks you to confirm first</span>
          </span>
        </button>
      </div>
      {naming && (
        <div className="rm-form" style={{ marginTop: 10 }}>
          <input className="st-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="The new Field's name" aria-label="New Field name" />
          <Button variant="primary" block disabled={busy} onClick={() => void create()}>
            {busy ? "Creating…" : name.trim() ? `Create the Field "${name.trim()}"` : "Create the Field"}
          </Button>
          {error && <ActionError>{error}</ActionError>}
        </div>
      )}
      <div className="t-eyebrow rm-sheet-eyebrow">A life track, practice only</div>
      <p className="t-meta" style={{ margin: "0 2px 8px" }}>
        For an aim with no cards to hold (a 10K, a care routine). The plan then has practices and steps only.
      </p>
      <div className="segc rm-seg-fill rm-seg-2" role="group" aria-label="Life track">
        {(["BODY", "CARE", "DUTY", "CRAFT"] as const).map((t) => (
          <button key={t} type="button" aria-pressed={draft.areaTrack === t} onClick={() => onPickTrack(t)} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
            <Sigil track={TRACK_SIGIL[t]} />
            {TRACK_WORD[t]}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function OtherDomainsSheet({ open, onClose, fields, areaId, chosen, onToggle }: { open: boolean; onClose: () => void; fields: readonly IntakeFieldOption[]; areaId: string | null; chosen: readonly string[]; onToggle: (id: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Add a Domain from another Field" description="Your library only. Each shows its real cards.">
      {fields
        .filter((f) => f.id !== areaId && f.domains.length > 0)
        .map((f) => (
          <div key={f.id}>
            <div className="t-eyebrow rm-sheet-eyebrow">{f.name}</div>
            <div className="rm-dchips">
              {f.domains.map((d) => (
                <button key={d.id} type="button" className="rm-dchip" aria-pressed={chosen.includes(d.id)} onClick={() => onToggle(d.id)}>
                  <b>{d.name}</b>
                  <span>
                    {plural(d.cards, "card")} · {d.atSix} at level 6+
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
    </Sheet>
  );
}

export function RoadmapForm({ view }: { view: IntakeView }) {
  const runtime = useRoadmapRuntime();
  const ids = { aim: useId(), date: useId(), hours: useId(), newCards: useId(), typical: useId(), source: useId(), constraints: useId(), exam: useId(), syllabus: useId(), sylSource: useId() };
  const [d, setD] = useState<IntakeDraft>(() => (view.draft ? draftOfIntake(view.draft.intake) : emptyIntakeDraft(view.today)));
  const [restored, setRestored] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  const [problems, setProblems] = useState<Partial<Record<IntakeField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Path | null>(null);
  const loaded = useRef(false);
  // Set by the user's own edits only: a visit that changes nothing stores nothing.
  const dirty = useRef(false);
  const inset = useKeyboardInset();
  // The fixtures (/dev/style/roadmap, the checks) never read or write the device's stored form.
  const storage = !runtime.fixture;

  // Restore the unsent form after mount (storage exists only in the browser); the server's open DRAFT wins.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    if (view.draft || !storage) return;
    const stored = readStored();
    if (stored) {
      // A stored form is an external system read once after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setD({ ...emptyIntakeDraft(view.today), ...stored });
      setRestored(true);
    }
  }, [view.draft, view.today, storage]);

  // Autosave the unsent form (debounced) once the user has changed something.
  useEffect(() => {
    if (!loaded.current || !dirty.current || !storage) return;
    const t = window.setTimeout(() => writeStored(d), 400);
    return () => window.clearTimeout(t);
  }, [d, storage]);

  const edit = (f: (x: IntakeDraft) => IntakeDraft) => {
    dirty.current = true;
    setD(f);
  };
  const set = <K extends keyof IntakeDraft>(k: K, v: IntakeDraft[K]) => edit((x) => ({ ...x, [k]: v }));
  const field = view.fields.find((f) => f.id === d.fieldId) ?? null;
  const trackArea = !d.fieldId && d.areaTrack != null;
  const allDomains = useMemo(() => new Map(view.fields.flatMap((f) => f.domains.map((x) => [x.id, { ...x, fieldName: f.name, fieldId: f.id }] as const))), [view.fields]);
  const span = daysBetween(view.today, d.targetDay);
  const splitLine = splitHint(view.today, d.targetDay);
  const askCards = asksNewCards(field, d.domainIds);

  const pickField = (f: IntakeFieldOption) => {
    edit((x) => ({ ...x, fieldId: f.id, areaTrack: null, track: x.areaTrack ? DEFAULT_FIELD_TRACK : x.track, domainIds: f.domains.filter((dm) => dm.cards > 0).map((dm) => dm.id) }));
    setAreaOpen(false);
  };
  const pickTrack = (t: Track) => {
    edit((x) => ({ ...x, fieldId: null, areaTrack: t, track: t, domainIds: [], practicesAllowed: true }));
    setAreaOpen(false);
  };
  const toggleDomain = (id: string) => edit((x) => ({ ...x, domainIds: x.domainIds.includes(id) ? x.domainIds.filter((y) => y !== id) : [...x.domainIds, id] }));

  const submit = async (path: Path) => {
    setError(null);
    const { intake, problems: p } = intakeOf(d, view.today);
    setProblems(p);
    if (!intake) {
      const first = Object.keys(p)[0];
      document.getElementById(`rm-f-${first}`)?.scrollIntoView({ block: "center" });
      return;
    }
    setBusy(path);
    try {
      const saved = await runtime.actions.saveIntake(intake);
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      const id = saved.value.roadmapId;
      const next = path === "GEMINI" ? await runtime.actions.draftRoadmap(id) : path === "STARTER" ? await runtime.actions.buildStarter(id) : await runtime.actions.startManual(id);
      if (!next.ok) {
        setError(next.error);
        return;
      }
      if (storage) writeStored(null);
      dirty.current = false;
      runtime.push(ROADMAP_HREF);
      runtime.refresh();
    } catch {
      setError("That didn't go through. Check your connection and try again; your form is kept.");
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    if (!view.draft) return;
    const id = view.draft.roadmapId;
    const res = await runtime.actions.discardDraft(id);
    if (res.ok) {
      setD(emptyIntakeDraft(view.today));
      pushToast({ title: "Draft discarded", action: { label: "Undo", onAction: () => void runtime.actions.undoDiscard(id).then(() => runtime.refresh()) } });
      runtime.refresh();
    } else setError(res.error);
  };

  const problem = (k: IntakeField) =>
    problems[k] ? (
      <p className="t-error" role="alert" style={{ marginTop: 8 }}>
        {problems[k]}
      </p>
    ) : null;

  const tracked = view.tracked;
  const trackedLine =
    tracked == null
      ? null
      : tracked.kind === "measured"
        ? `You've tracked ${hoursLabel(tracked.median)} a week of tasks (task estimates, not timed; median of ${plural(tracked.weeks, "week")}).`
        : `Calibrating — ${tracked.have} of ${tracked.need} weeks.`;
  const sums = field ? field.domains.reduce((a, x) => ({ atSix: a.atSix + x.atSix, atTop: a.atTop + x.atTop }), { atSix: 0, atTop: 0 }) : null;

  return (
    <div className="rm-narrow">
      <p className="t-meta" style={{ margin: "0 4px 12px" }}>
        Say what you want to be able to do. {view.hasKey ? "Gemini can draft the structure; the app" : "The app"} sets every date, level and target from your records, and measures progress from them.
      </p>
      {view.draft && (
        <section className="card rm-note" style={{ marginBottom: 14 }}>
          <RoadmapGlyph name="info" />
          <span style={{ flex: 1 }}>
            Continuing your draft from {dayLabel(view.draft.savedDay, view.today)} ·{" "}
            <button type="button" className="rm-ilink" onClick={() => void discard()}>
              Discard it
            </button>
          </span>
        </section>
      )}
      {restored && !view.draft && (
        <section className="card rm-note" style={{ marginBottom: 14 }}>
          <RoadmapGlyph name="info" />
          <span style={{ flex: 1 }}>
            Your unsent form, as you left it ·{" "}
            <button
              type="button"
              className="rm-ilink"
              onClick={() => {
                setD(emptyIntakeDraft(view.today));
                if (storage) writeStored(null);
                dirty.current = false;
                setRestored(false);
              }}
            >
              Start over
            </button>
          </span>
        </section>
      )}
      <form
        className="rm-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(view.hasKey ? "GEMINI" : "STARTER");
        }}
      >
        <section className="card rm-fs" aria-label="The aim">
          <div className="rm-f" id="rm-f-aim">
            <label className="st-label" htmlFor={ids.aim}>
              What do you want to be able to do?
              <span className="rm-count">
                {d.aim.length} / {AIM_MAX}
              </span>
            </label>
            <textarea id={ids.aim} className="st-input" rows={2} maxLength={AIM_MAX} value={d.aim} onChange={(e) => set("aim", e.target.value)} />
            <p className="st-hint">Shown exactly as you wrote it, everywhere. Never rewritten.</p>
            {problem("aim")}
          </div>
          <div className="rm-f" id="rm-f-area">
            <span className="st-label">Area — what this grows</span>
            <button type="button" className="rm-pick" aria-haspopup="dialog" onClick={() => setAreaOpen(true)}>
              {trackArea && d.areaTrack ? <Sigil track={TRACK_SIGIL[d.areaTrack]} /> : <Sigil track="know" />}
              <span className="rm-pick-t">
                <b>{field ? field.name : trackArea && d.areaTrack ? `${TRACK_WORD[d.areaTrack]} · practice only` : "Pick an Area"}</b>
                <span className="t-meta">{field ? `Field · level ${field.level} · ${plural(field.cards, "card")}` : trackArea ? "a life track: practices and steps only" : "one of your Fields, or a life track"}</span>
              </span>
              <Icon name="chev" />
            </button>
            <p className="st-hint">
              One of your Fields, or a life track for an aim that is practice only. Gemini never picks the Area.
              {field?.inMaintenance ? " This Field is excused from quotas and Boss." : ""}
            </p>
            {problem("area")}
          </div>
          {field && (
            <div className="rm-f">
              <span className="st-label">Practices count toward</span>
              <Segmented className="rm-seg-fill" value={d.track} label="Practices count toward" onChange={(t) => set("track", t)} options={ROADMAP_TRACKS.map((t) => ({ value: t, label: TRACK_WORD[t] }))} />
              <p className="st-hint">The life track the practices you start will feed on Today.</p>
            </div>
          )}
          {trackArea && d.areaTrack && (
            <div className="rm-f">
              <span className="st-label">Practices count toward</span>
              <div className="rm-fact" style={{ marginTop: 0 }}>
                <b className="ink-0">{TRACK_WORD[d.areaTrack]}</b> — fixed by the Area. The plan has practices and steps only; there are no cards to hold.
              </div>
            </div>
          )}
          {field && (
            <div className="rm-f">
              <span className="st-label">
                Domains you already have <span className="rm-opt">{d.domainIds.length} chosen</span>
              </span>
              <div className="rm-dchips" role="group" aria-label="Domains">
                {field.domains.map((dm) => (
                  <button key={dm.id} type="button" className="rm-dchip" aria-pressed={d.domainIds.includes(dm.id)} onClick={() => toggleDomain(dm.id)}>
                    <b>{dm.name}</b>
                    <span>
                      {plural(dm.cards, "card")} · {dm.atSix} at level 6+
                    </span>
                  </button>
                ))}
                {d.domainIds
                  .filter((id) => !field.domains.some((dm) => dm.id === id))
                  .map((id) => {
                    const dm = allDomains.get(id);
                    if (!dm) return null;
                    return (
                      <button key={id} type="button" className="rm-dchip" aria-pressed onClick={() => toggleDomain(id)}>
                        <b>{dm.name}</b>
                        <span>
                          {dm.fieldName} · {plural(dm.cards, "card")} · {dm.atSix} at level 6+
                        </span>
                      </button>
                    );
                  })}
                <button type="button" className="rm-dchip rm-dchip-add" onClick={() => setOthersOpen(true)}>
                  <b>+ Add a Domain from another Field</b>
                  <span>your library only</span>
                </button>
              </div>
              <p className="st-hint">Prefilled with the {field.name} Domains that hold cards. Counts are your cards today.</p>
            </div>
          )}
        </section>

        <section className="card rm-fs" aria-label="Time and pace">
          <div className="rm-f" id="rm-f-targetDay">
            <label className="st-label" htmlFor={ids.date}>
              By when
            </label>
            <input
              id={ids.date}
              type="date"
              className="st-input"
              value={d.targetDay}
              min={addDays(view.today, SPAN_MIN_DAYS)}
              max={addDays(view.today, SPAN_MAX_DAYS)}
              onChange={(e) => set("targetDay", e.target.value)}
            />
            <p className="st-hint">
              {Number.isFinite(span) && span > 0 ? `${dayWithWeekday(d.targetDay)} · ${count(span)} days from today` : "Pick a date"}
            </p>
            <div className="rm-chips">
              {[3, 6, 12, 24].map((mo) => (
                <ChipButton key={mo} pressed={d.targetDay === addMonths(view.today, mo)} onClick={() => set("targetDay", addMonths(view.today, mo))}>
                  {mo} months
                </ChipButton>
              ))}
              <ChipButton pressed={d.targetDay === addDays(view.today, SPAN_MAX_DAYS)} onClick={() => set("targetDay", addDays(view.today, SPAN_MAX_DAYS))}>
                3 years
              </ChipButton>
            </div>
            {splitLine && <p className="st-hint">{splitLine}</p>}
            {problem("targetDay")}
          </div>
          <div className="rm-f" id="rm-f-hours">
            <span className="st-label" id="hours">
              Hours a week for this aim
            </span>
            <div className="rm-step">
              <GlyphButton glyph="minus" label="One hour less" onClick={() => set("hours", String(Math.max(HOURS_MIN, (Number(d.hours) || HOURS_MIN) - 1)))} />
              <input id={ids.hours} className="st-input" inputMode="numeric" aria-label="Hours a week" value={d.hours} onChange={(e) => set("hours", e.target.value.replace(/[^\d]/g, ""))} />
              <button type="button" className="icon-btn" aria-label="One hour more" onClick={() => set("hours", String(Math.min(HOURS_MAX, (Number(d.hours) || 0) + 1)))}>
                <Icon name="plus" />
              </button>
              <span className="t-meta">
                h a week · {HOURS_MIN} to {HOURS_MAX}
              </span>
            </div>
            {trackedLine && (
              <div className="rm-fact">
                <span className="t-eyebrow">What the app has seen</span>
                {trackedLine}
              </div>
            )}
            {problem("hours")}
          </div>
          <div className="rm-f">
            <span className="st-label">Where you&apos;re starting</span>
            <Segmented className="rm-seg-fill rm-seg-2" value={d.startPoint} label="Where you're starting" onChange={(v) => set("startPoint", v)} options={START_POINTS.map((p) => ({ value: p, label: START_POINT_WORD[p] }))} />
            {field && sums && (
              <div className="rm-fact">
                <span className="t-eyebrow">Your cards, from the app</span>
                {field.name}: {plural(field.cards, "card")}, {sums.atSix} at level 6+, {sums.atTop} mastered. Your choice sets only the first milestone&apos;s level; the cards decide the rest.
              </div>
            )}
          </div>
          <div className="rm-f">
            <span className="st-label">How hard</span>
            <Segmented className="rm-seg-fill" value={d.intensity} label="How hard" onChange={(v) => set("intensity", v)} options={INTENSITIES.map((i) => ({ value: i, label: INTENSITY_WORD[i] }))} />
            <p className="st-hint">{intensityHint()}</p>
          </div>
          {askCards && (
            <div className="rm-f" id="rm-f-newCards">
              <label className="st-label" htmlFor={ids.newCards}>
                New cards a week{" "}
                <span className="rm-opt">
                  optional · {NEW_CARDS_PER_WEEK_MIN} to {NEW_CARDS_PER_WEEK_MAX}
                </span>
              </label>
              <input id={ids.newCards} className="st-input rm-num" inputMode="numeric" placeholder="e.g. 4" value={d.newCards} onChange={(e) => set("newCards", e.target.value.replace(/[^\d]/g, ""))} />
              <p className="st-hint">How many new cards a week will you write for this? Leave it blank and new cards won&apos;t be counted until your pace is measured.</p>
              {problem("newCards")}
            </div>
          )}
        </section>

        <section className="card rm-fs" aria-label="Facts only you can give">
          <details className="rm-adv rm-adv-first" id="reality" open={Boolean(d.typicalHours) || Boolean(problems.typicalHours)}>
            <summary>
              <Icon name="chev" />
              Reality check<span className="rm-adv-aside">{d.typicalHours ? `optional · ${d.typicalHours} h` : "optional · not set"}</span>
            </summary>
            <div className="rm-adv-b">
              <p className="st-hint" style={{ margin: 0 }}>
                Without this the app can&apos;t say whether the aim fits your time — only whether its own targets do.
              </p>
              <div className="rm-f" id="rm-f-typicalHours">
                <label className="st-label" htmlFor={ids.typical}>
                  Hours this usually takes{" "}
                  <span className="rm-opt">
                    {TYPICAL_HOURS_MIN} to {TYPICAL_HOURS_MAX}
                  </span>
                </label>
                <input id={ids.typical} className="st-input rm-num" inputMode="numeric" placeholder="e.g. 1500" value={d.typicalHours} onChange={(e) => set("typicalHours", e.target.value.replace(/[^\d]/g, ""))} />
                {problem("typicalHours")}
              </div>
              <div className="rm-f">
                <label className="st-label" htmlFor={ids.source}>
                  Where that figure comes from
                  <span className="rm-count">
                    {d.typicalSource.length} / {SOURCE_NOTE_MAX}
                  </span>
                </label>
                <input id={ids.source} className="st-input" maxLength={SOURCE_NOTE_MAX} placeholder="A source you trust" value={d.typicalSource} onChange={(e) => set("typicalSource", e.target.value)} />
              </div>
            </div>
          </details>
          <div className="rm-f" id="rm-f-constraints">
            <label className="st-label" htmlFor={ids.constraints}>
              Constraints
              <span className="rm-opt">
                optional · {d.constraints.length} / {CONSTRAINTS_MAX}
              </span>
            </label>
            <textarea id={ids.constraints} className="st-input" rows={2} maxLength={CONSTRAINTS_MAX} value={d.constraints} onChange={(e) => set("constraints", e.target.value)} />
            <p className="st-hint">Shown to Gemini as limits. The app doesn&apos;t check them; it flags suggestions that seem to clash.</p>
          </div>
          <div className="rm-f" id="rm-f-exam">
            <label className="st-label" htmlFor={ids.exam}>
              Exam or certificate <span className="rm-opt">optional</span>
            </label>
            <input id={ids.exam} className="st-input" maxLength={EXAM_MAX} placeholder="Leave blank if there isn't one" value={d.exam} onChange={(e) => set("exam", e.target.value)} />
          </div>
          <details className="rm-adv" id="syllabus" open={Boolean(d.syllabus) || Boolean(problems.syllabus)}>
            <summary>
              <Icon name="chev" />
              Official syllabus<span className="rm-adv-aside">{d.syllabus.trim() ? `optional · ${plural(d.syllabus.split(/\r?\n/).filter((l) => l.trim()).length, "line")}` : "optional · none"}</span>
            </summary>
            <div className="rm-adv-b" id="rm-f-syllabus">
              <p className="st-hint" style={{ margin: 0 }}>
                Paste the topic list from the official source. The plan&apos;s topics then come from your list.
              </p>
              <textarea id={ids.syllabus} className="st-input" rows={3} placeholder={`One topic per line · up to ${SYLLABUS_MAX_LINES} lines`} aria-label="Syllabus lines" value={d.syllabus} onChange={(e) => set("syllabus", e.target.value)} />
              <input id={ids.sylSource} className="st-input" maxLength={SOURCE_NOTE_MAX} placeholder="Source" aria-label="Syllabus source" value={d.syllabusSource} onChange={(e) => set("syllabusSource", e.target.value)} />
              {problem("syllabus")}
            </div>
          </details>
          <details className="rm-adv">
            <summary>
              <Icon name="chev" />
              Advanced<span className="rm-adv-aside">{trackArea || d.practicesAllowed ? "practices on" : "practices off"}</span>
            </summary>
            <div className="rm-adv-b">
              {trackArea ? (
                <p className="st-hint" style={{ margin: 0 }}>
                  Practices are always on for a life-track Area.
                </p>
              ) : (
                <div className="rm-sw">
                  <span className="rm-sw-t">Include practices (things to do, not just know)</span>
                  <Switch checked={d.practicesAllowed} onChange={(v) => set("practicesAllowed", v)} label="Include practices" />
                </div>
              )}
              {view.hasKey && (
                <p className="st-hint" style={{ margin: 0 }}>
                  {privacyLine(PACK_SECTIONS)}
                </p>
              )}
              {view.hasKey && view.keyTier === "FREE" && (
                <p className="st-hint" style={{ margin: 0 }}>
                  {FREE_TIER_LINE}
                </p>
              )}
            </div>
          </details>
        </section>

        <div className="rm-sticky" data-kb={inset > 0 ? "1" : undefined} style={inset > 0 ? ({ ["--kb" as string]: `${inset}px` } as CSSProperties) : undefined}>
          {view.hasKey ? (
            <>
              <Button type="submit" variant="primary" size="lg" disabled={busy != null}>
                {busy === "GEMINI" ? "Saving…" : "Draft with Gemini"}
              </Button>
              <Button size="lg" disabled={busy != null} onClick={() => void submit("STARTER")}>
                {busy === "STARTER" ? "Building…" : "Build from my numbers"}
              </Button>
            </>
          ) : (
            <>
              <Button type="submit" variant="primary" size="lg" disabled={busy != null}>
                {busy === "STARTER" ? "Building…" : "Build from my numbers"}
              </Button>
              <Button size="lg" disabled={busy != null} onClick={() => void submit("MANUAL")}>
                {busy === "MANUAL" ? "Opening…" : "Write it myself"}
              </Button>
              <p className="t-meta">{NO_KEY_LINE}</p>
            </>
          )}
          {view.activeRoadmapId && (
            <>
              <p className="t-error" role="alert">
                You already have an active roadmap.
              </p>
              <p className="t-meta">
                <Link className="rm-ilink" href={ROADMAP_HREF}>
                  Open it
                </Link>{" "}
                ·{" "}
                <Link className="rm-ilink" href={`${ROADMAP_HREF}#archive`}>
                  Archive it to start another
                </Link>
              </p>
            </>
          )}
          {view.writesOff && <p className="t-meta">Roadmap changes are recorded only on the live app; your form stays on this device.</p>}
          {error && <ActionError>{error}</ActionError>}
        </div>
      </form>
      <AreaSheet open={areaOpen} onClose={() => setAreaOpen(false)} fields={view.fields} draft={d} onPickField={pickField} onPickTrack={pickTrack} />
      <OtherDomainsSheet open={othersOpen} onClose={() => setOthersOpen(false)} fields={view.fields} areaId={d.fieldId} chosen={d.domainIds} onToggle={toggleDomain} />
    </div>
  );
}
