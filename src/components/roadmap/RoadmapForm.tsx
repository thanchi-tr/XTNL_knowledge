"use client";

/**
 * /you/roadmap/new, the intake (lane R5; F2; roadmap-rev4.md F-R4-1, F-R4-4,
 * F-R4-7, F-R4-9, F-R4-16, F-R4-19, F-R4-24; final-roadmap-new.html). The
 * Form template: one column at most 640 wide, 16 px inputs under 600 px, and
 * a sticky submit (.add-sticky's pattern) that is never a dead button.
 *
 * A Field Area, in this order (F-R4-4):
 *   Aim (verbatim, never rewritten; "Think a year or more out"; a quiet hint
 *   when it reads vague, never blocking, never editing) · Area · Depth
 *   (Mastered · level 12 by default; a lower depth is the user's choice) ·
 *   Domains, with "How many cards each Domain needs" (every term of every
 *   Domain's count, Edit, the lines tied to no Domain) or, with none, "Name
 *   the areas this needs" · By when ("When realistic" first and pressed; each
 *   chosen chip with its floor verdict, none hidden or disabled) · Hours ·
 *   Exam (Yes / No, prefilled from the aim, with its name and its optional
 *   date: a waypoint) · Outline (each line's Domain, prefilled by a
 *   deterministic match and changed by the user) · How hard (the share of the
 *   usual pace the plan counts on) · New cards a week (required when the app
 *   needs a pace to date the plan) · Reality check · Constraints · Advanced.
 * A life-track Area keeps rev 3's: a chosen date (12 months by default),
 * Where you're starting, no depth.
 *
 * Gemini appears only while ROADMAP_GEMINI_LIVE and a key both hold (the
 * view's hasKey): [Draft with Gemini] says what it will arrange. Otherwise
 * [Build from my numbers] and [Write it myself] with NO_KEY_LINE. The area
 * suggestions switch shows only while ROADMAP_GAPS_LIVE.
 *
 * On mount, with no open DRAFT, an aim handed over from /you, a long goal,
 * the capture sheet or a plan made before revision 4 (takeAimHandoff, a
 * sessionStorage entry: the aim never travels in a URL) fills the form, with
 * a note saying where it came from; the capture sheet's line is cleared only
 * once saveIntake succeeds. With an open DRAFT the draft wins ("Use it").
 * The unsent form survives in guarded localStorage (roadmap-autosave), which
 * the /you card reads and writes too; an open DRAFT is edited, not
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
  AIM_DEPTHS,
  AIM_MAX,
  CONSTRAINTS_MAX,
  COVER_MAX,
  COVER_MIN,
  DEFAULT_FIELD_TRACK,
  DEFAULT_INTENSITY,
  DEPTH_DEFAULT,
  DEPTH_DOMAINS_MAX,
  DEPTH_KEYS,
  EXAM_MAX,
  HOURS_MAX,
  HOURS_MIN,
  INTENSITIES,
  NEW_CARDS_PER_WEEK_MAX,
  NEW_CARDS_PER_WEEK_MIN,
  PACK_SECTIONS,
  ROADMAP_GAPS_LIVE,
  ROADMAP_GEMINI_LIVE,
  ROADMAP_TRACKS,
  SOURCE_NOTE_MAX,
  SPAN_MAX_DAYS,
  SPAN_MIN_DAYS,
  START_POINTS,
  SYLLABUS_LINE_MAX,
  SYLLABUS_MAX_LINES,
  TYPICAL_HOURS_MAX,
  TYPICAL_HOURS_MIN,
  examPrefillOf,
  floorBase,
  milestoneCountFor,
  type CoverageBreakdown,
  type DateMode,
  type DepthKey,
  type Intake,
  type IntakeFieldOption,
  type IntakeView,
  type Intensity,
  type StartPoint,
} from "@/lib/roadmap-types";
import { coverageOf, lineDomainDefaultOf } from "@/lib/roadmap-realism";
import { VAGUE_AIM_IDLE_MS, vagueAimHint } from "@/lib/roadmap-invite";
import { takeAimHandoff, type StoredAimHandoff } from "@/lib/roadmap-handoff";
import { clearSheetDraftIf } from "@/lib/idea-handoff";
import {
  AIM_LONG_HINT,
  COVERAGE_TITLE,
  EXAM_DATE_LABEL,
  EXAM_NAME_LABEL,
  EXAM_QUESTION,
  EXAM_WAYPOINT_HINT,
  FREE_TIER_LINE,
  INTENSITY_WORD,
  LINE_NO_DOMAIN,
  NAME_AREAS_HINT,
  NAME_AREAS_LABEL,
  NEW_CARDS_REQUIRED_HINT,
  NO_KEY_LINE,
  OUTLINE_EXAM_LABEL,
  OUTLINE_LABEL,
  START_POINT_WORD,
  SUGGEST_AREAS_LABEL,
  TRACK_SIGIL,
  TRACK_WORD,
  VAGUE_AIM_LINE,
  WHEN_REALISTIC,
  addMonths,
  chipVerdict,
  chosenDateHint,
  count,
  coverageRowLine,
  dayLabel,
  dayWithWeekday,
  depthHint,
  depthStage,
  geminiArrangesLine,
  handoffNote,
  hoursLabel,
  intensityHint,
  openDraftNote,
  paceShareHint,
  plural,
  privacyLine,
  realisticHint,
  recallCountLine,
  unassignedLinesLine,
} from "./roadmap-copy";
import { ROADMAP_HREF } from "./roadmap-links";
import { useRoadmapRuntime } from "./roadmap-runtime";
import { INTAKE_STORAGE_KEY, readStoredIntake, writeStoredIntake } from "./roadmap-autosave";
import { GlyphButton, RoadmapGlyph } from "./RoadmapGlyph";
import type { LiveGates } from "./GapPanel";
import "@/components/library/study.css";
import "./roadmap.css";

/** Where the unsent form waits (guarded: storage may be off or full; never in the URL). The /you card reads its aim. */
export { INTAKE_STORAGE_KEY };

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
  // ── Revision 4 (every field optional in a stored form from before it) ──
  /** A Field Area's depth (Mastered by default). */
  depth?: DepthKey;
  /** REALISTIC ("When realistic", a Field Area's default) or CHOSEN (a chip or the date input). */
  dateMode?: DateMode;
  /** "Is there an exam or qualification at the end?": the user's answer; null until answered (the aim prefills it). */
  examAnswer?: boolean | null;
  examDay?: string;
  /** Each outline line's Domain as the user set it, by the line's words ("" = tied to no Domain); other lines take the deterministic match. */
  lineDomainBy?: Record<string, string>;
  /** Typed coverage figures by Domain id (YOURS). */
  coverage?: Record<string, string>;
  /** An empty library's "Name the areas this needs". */
  newDomainNames?: string[];
  /** Area suggestions (only while ROADMAP_GAPS_LIVE). */
  suggestAreas?: boolean;
  /** "Start again at a depth": the legacy roadmap saving this archives. */
  replaces?: string | null;
}

/** The form's defaults. A Field Area dates the plan "When realistic"; a life-track Area takes a chosen date, 12 months out. */
export function emptyIntakeDraft(today: string, area: "FIELD" | "TRACK" = "FIELD"): IntakeDraft {
  return {
    aim: "",
    fieldId: null,
    areaTrack: null,
    track: DEFAULT_FIELD_TRACK,
    domainIds: [],
    targetDay: addMonths(today, 12),
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
    depth: DEPTH_DEFAULT,
    dateMode: area === "FIELD" ? "REALISTIC" : "CHOSEN",
    examAnswer: null,
    examDay: "",
    lineDomainBy: {},
    coverage: {},
    newDomainNames: [],
    suggestAreas: false,
    replaces: null,
  };
}

/** A saved Intake back into the form. */
export function draftOfIntake(i: Intake): IntakeDraft {
  const lines = i.syllabus?.lines ?? [];
  const lineDomainBy: Record<string, string> = {};
  if (i.syllabus?.lineDomains) lines.forEach((l, k) => (lineDomainBy[l] = i.syllabus?.lineDomains?.[k] ?? ""));
  const depthKey = DEPTH_KEYS.find((k) => AIM_DEPTHS[k] === i.depth) ?? DEPTH_DEFAULT;
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
    syllabus: lines.join("\n"),
    syllabusSource: i.syllabus?.source ?? "",
    practicesAllowed: i.practicesAllowed,
    depth: depthKey,
    dateMode: i.fieldId ? (i.dateMode ?? "CHOSEN") : "CHOSEN",
    examAnswer: i.examLabel ? true : i.exam === false ? false : null,
    examDay: i.examDay ?? "",
    lineDomainBy,
    coverage: Object.fromEntries(Object.entries(i.coverage ?? {}).map(([k, v]) => [k, String(v)])),
    newDomainNames: [...(i.newDomainNames ?? [])],
    suggestAreas: i.suggestAreas === true,
    replaces: i.replaces ?? null,
  };
}

export type IntakeField = "aim" | "area" | "targetDay" | "hours" | "newCards" | "typicalHours" | "typicalSource" | "constraints" | "exam" | "syllabus" | "domains" | "coverage";

/** The outline's lines as the server cleans them (blank lines out). */
export function outlineLinesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** The exam answer in force: the user's, else the aim's prefill (isCredentialAim over the aim; "EUR/USD" only prefills). */
export function examAnswerOf(d: Pick<IntakeDraft, "examAnswer" | "aim">): boolean {
  return d.examAnswer ?? examPrefillOf(d.aim);
}

/** Each outline line's Domain: the user's (by its words), else the deterministic match among the chosen Domains (R2's lineDomainDefaultOf). */
export function lineDomainsOf(lines: readonly string[], d: Pick<IntakeDraft, "lineDomainBy">, chosen: readonly { id: string; name: string }[]): (string | null)[] {
  const ids = new Set(chosen.map((c) => c.id));
  return lines.map((line) => {
    const by = d.lineDomainBy?.[line];
    if (by !== undefined) return by && ids.has(by) ? by : null;
    return lineDomainDefaultOf(line, chosen);
  });
}

/** The client's checks (the server re-validates every field). Returns the Intake, or the first problem per field. */
export function intakeOf(d: IntakeDraft, today: string, opts: { chosen?: readonly { id: string; name: string }[]; newCardsRequired?: boolean } = {}): { intake: Intake | null; problems: Partial<Record<IntakeField, string>> } {
  const problems: Partial<Record<IntakeField, string>> = {};
  const aim = d.aim.replace(/\s+/g, " ").trim();
  if (!aim) problems.aim = "Say what you want to be able to do.";
  else if (aim.length > AIM_MAX) problems.aim = `At most ${AIM_MAX} characters.`;
  if (!d.fieldId && !d.areaTrack) problems.area = "Pick the Area this grows: one of your Fields, or a life track.";
  const trackArea = !d.fieldId;
  const realistic = !trackArea && d.dateMode === "REALISTIC";
  if (!realistic) {
    const span = /^\d{4}-\d{2}-\d{2}$/.test(d.targetDay) ? daysBetween(today, d.targetDay) : NaN;
    if (!Number.isFinite(span)) problems.targetDay = "Pick a date.";
    else if (span < SPAN_MIN_DAYS) problems.targetDay = "Too short for a roadmap — capture it as a goal on Today.";
    else if (span > SPAN_MAX_DAYS) problems.targetDay = "Set where you want to be in 3 years; planning further out comes later.";
  }
  const hours = Number(d.hours);
  if (!Number.isInteger(hours) || hours < HOURS_MIN || hours > HOURS_MAX) problems.hours = `A whole number of hours, ${HOURS_MIN} to ${HOURS_MAX}.`;
  let newCards: number | null = null;
  if (d.newCards.trim()) {
    newCards = Number(d.newCards);
    if (!Number.isInteger(newCards) || newCards < NEW_CARDS_PER_WEEK_MIN || newCards > NEW_CARDS_PER_WEEK_MAX) problems.newCards = `A whole number, ${NEW_CARDS_PER_WEEK_MIN} to ${NEW_CARDS_PER_WEEK_MAX}, or leave it blank.`;
  } else if (realistic && opts.newCardsRequired) {
    problems.newCards = NEW_CARDS_REQUIRED_HINT;
  }
  let typical: number | null = null;
  if (d.typicalHours.trim()) {
    typical = Number(d.typicalHours);
    if (!Number.isInteger(typical) || typical < TYPICAL_HOURS_MIN || typical > TYPICAL_HOURS_MAX) problems.typicalHours = `A whole number of hours, ${TYPICAL_HOURS_MIN} to ${TYPICAL_HOURS_MAX}, or leave it blank.`;
  }
  if (d.typicalSource.length > SOURCE_NOTE_MAX) problems.typicalSource = `At most ${SOURCE_NOTE_MAX} characters.`;
  if (d.constraints.length > CONSTRAINTS_MAX) problems.constraints = `At most ${CONSTRAINTS_MAX} characters.`;
  const exam = trackArea ? d.exam.trim().length > 0 : examAnswerOf(d);
  if (d.exam.length > EXAM_MAX) problems.exam = `At most ${EXAM_MAX} characters.`;
  else if (!trackArea && exam && !d.exam.trim()) problems.exam = "Name the exam or qualification.";
  let examDay: string | null = null;
  if (exam && d.examDay?.trim()) {
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(d.examDay) && d.examDay > today && daysBetween(today, d.examDay) <= SPAN_MAX_DAYS;
    if (!ok) problems.exam = "The exam date must be between tomorrow and 3 years from now.";
    else examDay = d.examDay;
  }
  const lines = outlineLinesOf(d.syllabus);
  if (lines.length > SYLLABUS_MAX_LINES) problems.syllabus = `At most ${SYLLABUS_MAX_LINES} lines.`;
  else if (lines.some((l) => l.length > SYLLABUS_LINE_MAX)) problems.syllabus = `Each line at most ${SYLLABUS_LINE_MAX} characters.`;
  else if (d.syllabusSource.length > SOURCE_NOTE_MAX) problems.syllabus = `The source at most ${SOURCE_NOTE_MAX} characters.`;
  const named = trackArea ? [] : (d.newDomainNames ?? []).map((n) => n.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!trackArea && d.domainIds.length + named.length > DEPTH_DOMAINS_MAX) problems.domains = `A plan holds up to ${DEPTH_DOMAINS_MAX} Domains.`;
  const coverage: Record<string, number> = {};
  if (!trackArea) {
    for (const [id, raw] of Object.entries(d.coverage ?? {})) {
      if (!d.domainIds.includes(id) || !raw.trim()) continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < COVER_MIN || n > COVER_MAX) problems.coverage = `Type a coverage from ${COVER_MIN} to ${COVER_MAX} cards.`;
      else coverage[id] = n;
    }
  }
  if (Object.keys(problems).length > 0) return { intake: null, problems };
  const chosen = opts.chosen ?? [];
  const lineDomains = !trackArea && lines.length > 0 ? lineDomainsOf(lines, d, chosen) : undefined;
  return {
    intake: {
      aim,
      fieldId: d.fieldId,
      track: trackArea ? (d.areaTrack as Track) : d.track,
      domainIds: trackArea ? [] : d.domainIds,
      // REALISTIC: provisional (the server sets today + 3 years until a draft write dates it).
      targetDay: realistic ? addDays(today, SPAN_MAX_DAYS) : d.targetDay,
      hoursPerWeek: hours,
      newCardsPerWeek: newCards,
      typicalHours: typical,
      typicalHoursSource: typical != null && d.typicalSource.trim() ? d.typicalSource.trim() : null,
      syllabus: lines.length > 0 ? { lines, source: d.syllabusSource.trim() || null, ...(lineDomains ? { lineDomains } : {}) } : null,
      startPoint: d.startPoint,
      intensity: d.intensity,
      practicesAllowed: trackArea ? true : d.practicesAllowed,
      constraints: d.constraints.trim() || null,
      examLabel: exam ? d.exam.trim() || null : null,
      // Revision 4.
      depth: trackArea ? null : AIM_DEPTHS[d.depth ?? DEPTH_DEFAULT],
      dateMode: trackArea ? "CHOSEN" : realistic ? "REALISTIC" : "CHOSEN",
      exam: trackArea ? null : exam,
      examDay,
      coverage: Object.keys(coverage).length > 0 ? coverage : null,
      ...(named.length > 0 ? { newDomainNames: named } : {}),
      replaces: d.replaces ?? null,
      suggestAreas: !trackArea && ROADMAP_GAPS_LIVE && d.suggestAreas === true,
    },
    problems,
  };
}

/** Whether "New cards a week" is asked: a Field Area whose chosen Domains and Field have no measured pace. */
export function asksNewCards(field: IntakeFieldOption | null, domainIds: readonly string[]): boolean {
  if (!field || field.paceMeasured) return false;
  return !field.domains.some((d) => domainIds.includes(d.id) && d.paceMeasured);
}

/**
 * Whether a REALISTIC intake must name a pace before it saves ("needed"):
 * only when no pace is measured and some Domain, chosen or named, is short
 * of its count in recall cards (live < n). When every Domain already holds
 * its count, the new cards WRITE_MARGIN asks are its spare alone, and the
 * engine dates the plan on the cards held (roadmap-realism spareOnlyOf, the
 * WRITE_MARGIN ruling's option (b)), so the form never refuses for a pace it
 * doesn't need: the pace stays "optional". Probability (n 34, 42 live) needs
 * none; Inference (n 25, 9 live) does.
 */
export function newCardsRequiredOf(realistic: boolean, coverage: readonly Pick<CoverageBreakdown, "live" | "n">[], paceMeasured: boolean): boolean {
  return realistic && !paceMeasured && coverage.some((c) => c.live < c.n);
}

/** "The app splits this into 6 milestones of 10–11 weeks." (a life-track plan's estimate; Sundays decide it). */
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
  const v = readStoredIntake();
  return restorableIntake(v) ? v : null;
}

function writeStored(d: IntakeDraft | null) {
  writeStoredIntake(d);
}

/** The chosen Domains as the coverage and the line match read them (the Area's own first, then the ones from other Fields). */
export function chosenDomainsOf(fields: readonly IntakeFieldOption[], ids: readonly string[]): { id: string; name: string; cards: number; nonRecall: number | null }[] {
  const all = fields.flatMap((f) => f.domains);
  return ids
    .map((id) => all.find((x) => x.id === id))
    .filter((x): x is IntakeFieldOption["domains"][number] => Boolean(x))
    .map((x) => ({ id: x.id, name: x.name, cards: x.cards, nonRecall: nonRecallOf(x) }));
}

/**
 * A Domain option's multiple-choice count (IntakeFieldOption.domains[].nonRecall,
 * the contract §15.11, filled by R4's loadIntakeView); null while a view lacks
 * it, so the preview never invents one.
 */
export function nonRecallOf(x: Pick<IntakeFieldOption["domains"][number], "nonRecall">): number | null {
  const n = x.nonRecall;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** A Domain chip's count: "48 cards · 6 multiple choice not counted · 18 at level 6+" (question 16: the mix is shown where the count is). */
export function domainChipCount(x: Pick<IntakeFieldOption["domains"][number], "cards" | "atSix" | "nonRecall">): string {
  return `${recallCountLine(x.cards, nonRecallOf(x))} · ${x.atSix} at level 6+`;
}

/**
 * The capture sheet's line goes only when its aim reached the intake (lens 3):
 * the no-draft merge applied the handoff, or "Use it" was tapped on an open
 * draft. A handoff only shown beside an open draft leaves the line where it is.
 */
export function clearsCaptureLine(handoff: Pick<StoredAimHandoff, "source" | "sheetText"> | null, used: boolean): boolean {
  return used && handoff?.source === "capture" && Boolean(handoff.sheetText);
}

/**
 * What the no-draft merge took over from a handoff, as the mount effect
 * applies it (fix round 2, lens 3 #17): the Area when its Field is one of
 * the intake's (or a track Area came with its track); the Domains only when
 * the handoff carried the old plan's own — otherwise the form preselects
 * the Area's Domains with cards. The 'restart' note names only these.
 */
export function handoffCarriedOf(h: Pick<StoredAimHandoff, "areaFieldId" | "track" | "domainIds">, fields: readonly Pick<IntakeFieldOption, "id">[]): { area: boolean; domains: boolean } {
  const field = h.areaFieldId ? fields.some((f) => f.id === h.areaFieldId) : false;
  const track = !field && h.areaFieldId === null && Boolean(h.track);
  return { area: field || track, domains: field && (h.domainIds?.length ?? 0) > 0 };
}

/** The outline's disclosure opens for a link to #syllabus ([Add your outline], the draft's unassigned-lines link). */
export function opensOutline(hash: string | null | undefined): boolean {
  return hash === "#syllabus";
}

/** The coverage preview (F-R4-9): R2's coverageOf over the chosen and the named Domains, the outline's line Domains and the typed figures. */
export function coveragePreviewOf(
  chosen: readonly { id: string; name: string; cards: number; nonRecall: number | null }[],
  named: readonly string[],
  lineDomains: readonly (string | null)[],
  typed: Record<string, string> | undefined
): CoverageBreakdown[] {
  const typedNums: Record<string, number> = {};
  for (const [k, v] of Object.entries(typed ?? {})) if (v.trim() && Number.isInteger(Number(v))) typedNums[k] = Number(v);
  return coverageOf({
    domains: [...chosen.map((c) => ({ id: c.id, name: c.name, live: Math.max(0, c.cards - (c.nonRecall ?? 0)), nonRecall: c.nonRecall ?? 0 })), ...named.map((n) => ({ id: `named:${n}`, name: n, live: 0, nonRecall: 0 }))],
    lineDomains,
    typed: typedNums,
  });
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
    <Sheet open={open} onClose={onClose} title="Area — what this grows" description="Progress is measured in the Area you pick. Only you pick it.">
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
                  <span>{domainChipCount(d)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
    </Sheet>
  );
}

/** The Depth control (F-R4-9): the stage name over its level, Mastered first; a lower depth is the user's choice. */
function DepthControl({ value, onChange }: { value: DepthKey; onChange: (v: DepthKey) => void }) {
  return (
    <div className="segc rm-seg-fill rm-seg-two" role="group" aria-label="Depth">
      {DEPTH_KEYS.map((k) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          <b>{depthStage(AIM_DEPTHS[k])}</b>
          <small>level {AIM_DEPTHS[k]}</small>
        </button>
      ))}
    </div>
  );
}

/** "Name the areas this needs" (F-R4-24): an empty library's Domains, the user's own names, created in the Area Field when the intake saves. */
function NamedAreas({ names, onChange, room }: { names: readonly string[]; onChange: (n: string[]) => void; room: number }) {
  const [text, setText] = useState("");
  const id = useId();
  const add = () => {
    const n = text.replace(/\s+/g, " ").trim();
    if (!n || names.some((x) => x.toLowerCase() === n.toLowerCase()) || names.length >= room) return;
    onChange([...names, n]);
    setText("");
  };
  return (
    <div className="rm-f" id="rm-f-named">
      <label className="st-label" htmlFor={id}>
        {NAME_AREAS_LABEL} <span className="rm-opt">up to {room}</span>
      </label>
      <div className="rm-named">
        <input
          id={id}
          className="st-input"
          value={text}
          maxLength={80}
          placeholder="An area, in your words"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button onClick={add} disabled={!text.trim() || names.length >= room}>
          Add
        </Button>
      </div>
      {names.length > 0 && (
        <div className="rm-dchips" style={{ marginTop: 8 }}>
          {names.map((n) => (
            <button key={n} type="button" className="rm-dchip" aria-pressed aria-label={`Remove ${n}`} onClick={() => onChange(names.filter((x) => x !== n))}>
              <b>{n}</b>
              <span>a new Domain · tap to remove</span>
            </button>
          ))}
        </div>
      )}
      <p className="st-hint">{NAME_AREAS_HINT}</p>
    </div>
  );
}

/** "How many cards each Domain needs" (F-R4-9): every Domain's three terms, always; Edit types the user's own figure. */
function CoverageDisclosure({
  rows,
  typed,
  onType,
  unassigned,
  overMax,
}: {
  rows: readonly CoverageBreakdown[];
  typed: Record<string, string>;
  onType: (id: string, v: string) => void;
  unassigned: readonly number[];
  overMax: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const line = unassignedLinesLine(unassigned, overMax);
  if (rows.length === 0) return null;
  return (
    <details className="rm-adv" id="rm-f-coverage">
      <summary>
        <Icon name="chev" />
        {COVERAGE_TITLE}
        <span className="rm-adv-aside">{rows.map((r) => r.n).join(" · ")} cards</span>
      </summary>
      <ul className="rm-cov">
        {rows.map((r) => {
          const own = !r.domainId.startsWith("named:");
          return (
            <li key={r.domainId} className={r.belowPolicy ? "rm-cov-below" : undefined}>
              <span>
                {coverageRowLine(r)}
                {r.belowPolicy && <b> · below the app&apos;s {r.policy}: your choice, shown on the plan for good</b>}
              </span>
              {own &&
                (editing === r.domainId ? (
                  <input
                    className="st-input rm-num"
                    inputMode="numeric"
                    aria-label={`Cards ${r.name} needs`}
                    value={typed[r.domainId] ?? ""}
                    placeholder={String(r.policy)}
                    onChange={(e) => onType(r.domainId, e.target.value.replace(/[^\d]/g, ""))}
                    onBlur={() => setEditing(null)}
                  />
                ) : (
                  <Button variant="quiet" onClick={() => setEditing(r.domainId)} aria-label={`Edit ${r.name}'s count`}>
                    Edit
                  </Button>
                ))}
            </li>
          );
        })}
        {line && <li className="rm-cov-un">{line}</li>}
      </ul>
    </details>
  );
}

/** The outline's lines grouped by their Domain (F-R4-24), the "Not tied to a Domain" group last; each line's Domain is a select. */
function LineDomainGroups({
  lines,
  domains,
  chosen,
  onChange,
}: {
  lines: readonly string[];
  domains: readonly (string | null)[];
  chosen: readonly { id: string; name: string }[];
  onChange: (line: string, domainId: string) => void;
}) {
  const groups = [...chosen.map((c) => ({ id: c.id as string | null, name: c.name })), { id: null, name: LINE_NO_DOMAIN }];
  return (
    <div className="rm-lgroups">
      {groups.map((g) => {
        const rows = lines.map((l, i) => ({ l, i })).filter((x) => (domains[x.i] ?? null) === g.id);
        if (rows.length === 0) return null;
        return (
          <div key={g.id ?? "none"} className="rm-lgroup">
            <span className="t-eyebrow">{g.name}</span>
            {rows.map(({ l, i }) => (
              <div key={`${i}:${l}`} className="rm-lrow">
                <span className="rm-lrow-k">S{i + 1}</span>
                <span className="rm-lrow-t">{l}</span>
                <select className="st-input rm-lrow-sel" aria-label={`Change the Domain of S${i + 1}`} value={domains[i] ?? ""} onChange={(e) => onChange(l, e.target.value)}>
                  {chosen.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="">None</option>
                </select>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function RoadmapForm({ view, gates }: { view: IntakeView; /** Fixtures only: draw a lead-only state. */ gates?: LiveGates }) {
  const runtime = useRoadmapRuntime();
  const ids = { aim: useId(), date: useId(), hours: useId(), newCards: useId(), typical: useId(), source: useId(), constraints: useId(), exam: useId(), examDay: useId(), syllabus: useId(), sylSource: useId() };
  const [d, setD] = useState<IntakeDraft>(() => (view.draft ? draftOfIntake(view.draft.intake) : emptyIntakeDraft(view.today)));
  const [restored, setRestored] = useState(false);
  const [handoff, setHandoff] = useState<StoredAimHandoff | null>(null);
  // The handed-over aim reached the form (the no-draft merge, or "Use it" on an open draft): only then does the capture line go.
  const [handoffUsed, setHandoffUsed] = useState(false);
  // A link to #syllabus opens the outline and focuses its box.
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  const [problems, setProblems] = useState<Partial<Record<IntakeField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Path | null>(null);
  const [vague, setVague] = useState(false);
  const loaded = useRef(false);
  // Set by the user's own edits only: a visit that changes nothing stores nothing.
  const dirty = useRef(false);
  const inset = useKeyboardInset();
  // The fixtures (/dev/style/roadmap, the checks) never read or write the device's stored form.
  const storage = !runtime.fixture;
  const geminiLive = (gates?.gemini ?? ROADMAP_GEMINI_LIVE) && view.hasKey;
  const gapsLive = gates?.gaps ?? ROADMAP_GAPS_LIVE;

  // Restore the unsent form after mount (storage exists only in the browser); the server's open DRAFT wins.
  // An aim handed over (the /you card, a long goal, capture, a plan made before depths) fills it, once.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    if (!storage) return;
    const h = takeAimHandoff();
    if (view.draft) {
      // A stored form is an external system read once after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (h) setHandoff(h);
      return;
    }
    const stored = readStored();
    if (h) {
      const base: IntakeDraft = { ...emptyIntakeDraft(view.today), ...(stored ?? {}) };
      const field = h.areaFieldId ? view.fields.find((f) => f.id === h.areaFieldId) : null;
      const next: IntakeDraft = {
        ...base,
        aim: h.aim.slice(0, AIM_MAX),
        ...(h.targetDay ? { targetDay: h.targetDay, dateMode: "CHOSEN" as const } : {}),
        ...(field ? { fieldId: field.id, areaTrack: null, track: h.track ?? base.track, domainIds: h.domainIds?.length ? [...h.domainIds] : field.domains.filter((x) => x.cards > 0).map((x) => x.id) } : {}),
        ...(!field && h.areaFieldId === null && h.track ? { fieldId: null, areaTrack: h.track, track: h.track, domainIds: [], dateMode: "CHOSEN" as const } : {}),
        ...(h.replaces ? { replaces: h.replaces } : {}),
      };
      dirty.current = true;
      setD(next);
      setHandoff(h);
      setHandoffUsed(true);
      // The next question: the Area.
      window.setTimeout(() => {
        const el = document.getElementById("rm-f-area");
        el?.scrollIntoView({ block: "center" });
        el?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
      }, 0);
      return;
    }
    if (stored) {
      setD({ ...emptyIntakeDraft(view.today), ...stored });
      setRestored(true);
    }
  }, [view.draft, view.today, view.fields, storage]);

  // [Add your outline] and the draft's unassigned-lines link land on #syllabus: open the disclosure and put the cursor in its box.
  useEffect(() => {
    const follow = () => {
      if (!opensOutline(window.location.hash)) return;
      setOutlineOpen(true);
      window.setTimeout(() => {
        const box = document.getElementById(ids.syllabus);
        box?.scrollIntoView({ block: "center" });
        box?.focus({ preventScroll: true });
      }, 0);
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [ids.syllabus]);

  // Autosave the unsent form (debounced) once the user has changed something.
  useEffect(() => {
    if (!loaded.current || !dirty.current || !storage) return;
    const t = window.setTimeout(() => writeStored(d), 400);
    return () => window.clearTimeout(t);
  }, [d, storage]);

  // The vague-aim hint (F-R4-4): after a pause in typing, never blocking, never editing; it clears as soon as the aim reads well.
  useEffect(() => {
    const now = vagueAimHint(d.aim);
    if (!now) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVague(false);
      return;
    }
    const t = window.setTimeout(() => setVague(true), VAGUE_AIM_IDLE_MS);
    return () => window.clearTimeout(t);
  }, [d.aim]);

  const edit = (f: (x: IntakeDraft) => IntakeDraft) => {
    dirty.current = true;
    setD(f);
  };
  const set = <K extends keyof IntakeDraft>(k: K, v: IntakeDraft[K]) => edit((x) => ({ ...x, [k]: v }));
  const field = view.fields.find((f) => f.id === d.fieldId) ?? null;
  const trackArea = !d.fieldId && d.areaTrack != null;
  const fieldArea = Boolean(field);
  const m = view.m && view.m > 0 ? view.m : 1;
  const depthKey = d.depth ?? DEPTH_DEFAULT;
  const depth = AIM_DEPTHS[depthKey];
  const realistic = fieldArea && (d.dateMode ?? "REALISTIC") === "REALISTIC";
  const allDomains = useMemo(() => new Map(view.fields.flatMap((f) => f.domains.map((x) => [x.id, { ...x, fieldName: f.name, fieldId: f.id }] as const))), [view.fields]);
  const span = daysBetween(view.today, d.targetDay);
  const splitLine = splitHint(view.today, d.targetDay);
  const chosen = useMemo(() => chosenDomainsOf(view.fields, d.domainIds), [view.fields, d.domainIds]);
  const lines = useMemo(() => outlineLinesOf(d.syllabus), [d.syllabus]);
  const lineDomains = useMemo(() => lineDomainsOf(lines, d, chosen), [lines, d, chosen]);
  const named = useMemo(() => (fieldArea ? (d.newDomainNames ?? []) : []), [fieldArea, d.newDomainNames]);
  const coverage = useMemo(() => (fieldArea ? coveragePreviewOf(chosen, named, lineDomains, d.coverage) : []), [fieldArea, chosen, named, lineDomains, d.coverage]);
  const unassigned = lines.map((_, i) => i).filter((i) => lineDomains[i] == null);
  const paceMeasured = view.paceRate != null || !asksNewCards(field, d.domainIds);
  // Needed only when a Domain is short of its count: the spare alone is dated on the cards held (newCardsRequiredOf).
  const newCardsRequired = newCardsRequiredOf(realistic, coverage, paceMeasured);
  const askCards = fieldArea && (newCardsRequired || asksNewCards(field, d.domainIds));
  const exam = trackArea ? d.exam.trim().length > 0 : examAnswerOf(d);
  const emptyLibrary = fieldArea && field!.domains.length === 0;

  const pickField = (f: IntakeFieldOption) => {
    edit((x) => ({
      ...x,
      fieldId: f.id,
      areaTrack: null,
      track: x.areaTrack ? DEFAULT_FIELD_TRACK : x.track,
      domainIds: f.domains.filter((dm) => dm.cards > 0).map((dm) => dm.id),
      // A Field Area dates the plan when realistic, unless a date was handed over or picked.
      dateMode: x.areaTrack ? "REALISTIC" : (x.dateMode ?? "REALISTIC"),
    }));
    setAreaOpen(false);
  };
  const pickTrack = (t: Track) => {
    edit((x) => ({ ...x, fieldId: null, areaTrack: t, track: t, domainIds: [], practicesAllowed: true, dateMode: "CHOSEN", targetDay: x.dateMode === "REALISTIC" ? addMonths(view.today, 12) : x.targetDay }));
    setAreaOpen(false);
  };
  const toggleDomain = (id: string) => edit((x) => ({ ...x, domainIds: x.domainIds.includes(id) ? x.domainIds.filter((y) => y !== id) : [...x.domainIds, id] }));
  const pickDate = (day: string) => edit((x) => ({ ...x, targetDay: day, dateMode: "CHOSEN" }));

  const submit = async (path: Path) => {
    setError(null);
    const { intake, problems: p } = intakeOf(d, view.today, { chosen, newCardsRequired });
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
      // The capture sheet kept its line until the intake saved (F-R4-7): now it goes, if its aim reached this intake and it is still the same line.
      if (storage && handoff?.sheetText && clearsCaptureLine(handoff, handoffUsed)) clearSheetDraftIf(handoff.sheetText);
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
  const chips = view.dateChips ?? [];
  const chipFor = (months: 6 | 12 | 24 | 36) => chips.find((c) => c.months === months) ?? null;
  const chipDay = (months: 6 | 12 | 24 | 36) => chipFor(months)?.day ?? (months === 36 ? addDays(view.today, SPAN_MAX_DAYS) : addMonths(view.today, months));
  // A chip's verdict: the server's (the floor plus the writing the Domains need), else the floor alone at the user's m.
  const chipPossible = (months: 6 | 12 | 24 | 36) => {
    const c = chipFor(months);
    if (c) return c.possible[depthKey];
    return daysBetween(view.today, chipDay(months)) >= floorBase(depth, m);
  };
  const outlineLabel = trackArea ? OUTLINE_LABEL : exam ? OUTLINE_EXAM_LABEL : OUTLINE_LABEL;

  return (
    <div className="rm-narrow">
      <p className="t-meta" style={{ margin: "0 4px 12px" }}>
        Say what you want to be able to do. {geminiLive ? "Gemini can arrange the milestones; the app" : "The app"} sets every date, level and target from your records, and measures progress from them.
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
      {view.draft && handoff && (
        <section className="card rm-note" style={{ marginBottom: 14 }}>
          <RoadmapGlyph name="info" />
          <span style={{ flex: 1 }}>
            {openDraftNote(handoff.aim)} ·{" "}
            <button
              type="button"
              className="rm-ilink"
              onClick={() => {
                set("aim", handoff.aim.slice(0, AIM_MAX));
                setHandoffUsed(true);
              }}
            >
              Use it
            </button>
          </span>
        </section>
      )}
      {!view.draft && handoff && (
        <section className="card rm-note" style={{ marginBottom: 14 }}>
          <RoadmapGlyph name="info" />
          <span style={{ flex: 1 }}>{handoffNote(handoff.source, handoff.aim, handoffCarriedOf(handoff, view.fields))}</span>
        </section>
      )}
      {restored && !view.draft && !handoff && (
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
          void submit(geminiLive ? "GEMINI" : "STARTER");
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
            <p className="st-hint">{AIM_LONG_HINT}</p>
            {vague && <p className="t-meta rm-ink1 rm-vague">{VAGUE_AIM_LINE}</p>}
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
              One of your Fields, or a life track for an aim that is practice only. Only you pick the Area.
              {field?.inMaintenance ? " This Field is excused from quotas and Boss." : ""}
            </p>
            {problem("area")}
          </div>
          {field && (
            <div className="rm-f" id="rm-f-depth">
              <span className="st-label">Depth</span>
              <DepthControl value={depthKey} onChange={(v) => set("depth", v)} />
              <p className="st-hint">{depthHint(depth, m)}</p>
            </div>
          )}
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
          {field && !emptyLibrary && (
            <div className="rm-f" id="rm-f-domains">
              <span className="st-label">
                Domains you already have <span className="rm-opt">{d.domainIds.length} chosen · up to {DEPTH_DOMAINS_MAX}</span>
              </span>
              <div className="rm-dchips" role="group" aria-label="Domains">
                {field.domains.map((dm) => (
                  <button key={dm.id} type="button" className="rm-dchip" aria-pressed={d.domainIds.includes(dm.id)} onClick={() => toggleDomain(dm.id)}>
                    <b>{dm.name}</b>
                    <span>{domainChipCount(dm)}</span>
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
                          {dm.fieldName} · {domainChipCount(dm)}
                        </span>
                      </button>
                    );
                  })}
                <button type="button" className="rm-dchip rm-dchip-add" onClick={() => setOthersOpen(true)}>
                  <b>+ Add a Domain from another Field</b>
                  <span>your library only</span>
                </button>
              </div>
              <p className="st-hint">Prefilled with the {field.name} Domains that hold cards. Counts are your cards today; the plan counts every card type but multiple choice.</p>
              {problem("domains")}
              <CoverageDisclosure
                rows={coverage}
                typed={d.coverage ?? {}}
                onType={(id, v) => edit((x) => ({ ...x, coverage: { ...(x.coverage ?? {}), [id]: v } }))}
                unassigned={unassigned}
                overMax={d.domainIds.length >= DEPTH_DOMAINS_MAX}
              />
              {problem("coverage")}
            </div>
          )}
          {emptyLibrary && <NamedAreas names={named} onChange={(n) => set("newDomainNames", n)} room={DEPTH_DOMAINS_MAX} />}
          {emptyLibrary && named.length > 0 && (
            <CoverageDisclosure rows={coverage} typed={d.coverage ?? {}} onType={() => undefined} unassigned={unassigned} overMax={named.length >= DEPTH_DOMAINS_MAX} />
          )}
        </section>

        <section className="card rm-fs" aria-label="Time and pace">
          <div className="rm-f" id="rm-f-targetDay">
            <label className="st-label" htmlFor={ids.date}>
              By when
            </label>
            <div className="rm-chips rm-date-chips">
              {fieldArea && (
                <ChipButton pressed={realistic} onClick={() => set("dateMode", "REALISTIC")}>
                  {WHEN_REALISTIC}
                </ChipButton>
              )}
              {(fieldArea ? ([6, 12, 24] as const) : ([3, 6, 12, 24] as const)).map((mo) => {
                const day = fieldArea ? chipDay(mo as 6 | 12 | 24) : addMonths(view.today, mo);
                return (
                  <ChipButton key={mo} className={fieldArea ? "rm-chip-two" : undefined} pressed={!realistic && d.targetDay === day} onClick={() => pickDate(day)}>
                    {mo} months
                    {fieldArea && <small>{chipVerdict(chipPossible(mo as 6 | 12 | 24), depth)}</small>}
                  </ChipButton>
                );
              })}
              <ChipButton
                className={fieldArea ? "rm-chip-two" : undefined}
                pressed={!realistic && d.targetDay === (fieldArea ? chipDay(36) : addDays(view.today, SPAN_MAX_DAYS))}
                onClick={() => pickDate(fieldArea ? chipDay(36) : addDays(view.today, SPAN_MAX_DAYS))}
              >
                3 years
                {fieldArea && <small>{chipVerdict(chipPossible(36), depth)}</small>}
              </ChipButton>
            </div>
            {/* "When realistic" sets no date of the user's: the box stays empty until one is picked (pickDate switches to CHOSEN). */}
            <input
              id={ids.date}
              type="date"
              className="st-input"
              aria-label="A date of your own"
              value={realistic ? "" : d.targetDay}
              min={addDays(view.today, SPAN_MIN_DAYS)}
              max={addDays(view.today, SPAN_MAX_DAYS)}
              onChange={(e) => pickDate(e.target.value)}
            />
            <p className="st-hint">
              {realistic
                ? realisticHint(m)
                : fieldArea
                  ? chosenDateHint(d.targetDay, view.today, depth, m)
                  : Number.isFinite(span) && span > 0
                    ? `${dayWithWeekday(d.targetDay)} · ${count(span)} days from today`
                    : "Pick a date"}
            </p>
            {fieldArea && exam && <p className="st-hint">{EXAM_WAYPOINT_HINT}</p>}
            {trackArea && splitLine && <p className="st-hint">{splitLine}</p>}
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
          {trackArea && (
            <div className="rm-f">
              <span className="st-label">Where you&apos;re starting</span>
              <Segmented className="rm-seg-fill rm-seg-2" value={d.startPoint} label="Where you're starting" onChange={(v) => set("startPoint", v)} options={START_POINTS.map((p) => ({ value: p, label: START_POINT_WORD[p] }))} />
            </div>
          )}
          {field && sums && (
            <div className="rm-fact">
              <span className="t-eyebrow">Your cards, from the app</span>
              {field.name}: {plural(field.cards, "card")}, {sums.atSix} at level 6+, {sums.atTop} at level 12 or more. Your cards say where you start: a stage you already hold shows as held.
            </div>
          )}
        </section>

        <section className="card rm-fs" aria-label="Facts only you can give">
          {fieldArea && (
            <div className="rm-f" id="rm-f-exam">
              <span className="st-label">{EXAM_QUESTION}</span>
              <div className="segc rm-seg-fill" role="group" aria-label={EXAM_QUESTION}>
                <button type="button" aria-pressed={exam} onClick={() => set("examAnswer", true)}>
                  Yes
                </button>
                <button type="button" aria-pressed={!exam} onClick={() => set("examAnswer", false)}>
                  No
                </button>
              </div>
              {d.examAnswer == null && <p className="st-hint">Prefilled from your aim; yours to change.</p>}
              {exam && (
                <>
                  <label className="st-label" htmlFor={ids.exam} style={{ marginTop: 10 }}>
                    {EXAM_NAME_LABEL}
                  </label>
                  <input id={ids.exam} className="st-input" maxLength={EXAM_MAX} value={d.exam} onChange={(e) => set("exam", e.target.value)} />
                  <label className="st-label" htmlFor={ids.examDay} style={{ marginTop: 10 }}>
                    {EXAM_DATE_LABEL}
                  </label>
                  <input id={ids.examDay} type="date" className="st-input" value={d.examDay ?? ""} min={addDays(view.today, 1)} max={addDays(view.today, SPAN_MAX_DAYS)} onChange={(e) => set("examDay", e.target.value)} />
                  <p className="st-hint">
                    {EXAM_WAYPOINT_HINT}
                    {geminiLive ? " It is never sent to Gemini." : ""}
                  </p>
                </>
              )}
              {problem("exam")}
            </div>
          )}
          <details className="rm-adv rm-adv-first" id="syllabus" open={outlineOpen || Boolean(d.syllabus) || Boolean(problems.syllabus) || (fieldArea && exam)}>
            <summary>
              <Icon name="chev" />
              {fieldArea ? (exam ? "Official syllabus" : "Your outline") : "Official syllabus"}
              <span className="rm-adv-aside">{lines.length ? `optional · ${plural(lines.length, "line")}` : "optional · none"}</span>
            </summary>
            <div className="rm-adv-b" id="rm-f-syllabus">
              <p className="st-hint" style={{ margin: 0 }}>
                {fieldArea ? outlineLabel : "Paste the topic list from the official source. The plan's topics then come from your list."}
              </p>
              <textarea id={ids.syllabus} className="st-input" rows={3} placeholder={`One topic per line · up to ${SYLLABUS_MAX_LINES} lines`} aria-label="Outline lines" value={d.syllabus} onChange={(e) => set("syllabus", e.target.value)} />
              <input id={ids.sylSource} className="st-input" maxLength={SOURCE_NOTE_MAX} placeholder="Source" aria-label="Outline source" value={d.syllabusSource} onChange={(e) => set("syllabusSource", e.target.value)} />
              {fieldArea && lines.length > 0 && chosen.length > 0 && (
                <>
                  <p className="st-hint" style={{ margin: 0 }}>
                    Each line&apos;s Domain is yours: the app matched the names, and it sets how many cards each Domain needs.
                  </p>
                  <LineDomainGroups lines={lines} domains={lineDomains} chosen={chosen} onChange={(line, id) => edit((x) => ({ ...x, lineDomainBy: { ...(x.lineDomainBy ?? {}), [line]: id } }))} />
                </>
              )}
              {problem("syllabus")}
            </div>
          </details>
          {!fieldArea && (
            <div className="rm-f" id="rm-f-exam">
              <label className="st-label" htmlFor={ids.exam}>
                Exam or certificate <span className="rm-opt">optional</span>
              </label>
              <input id={ids.exam} className="st-input" maxLength={EXAM_MAX} placeholder="Leave blank if there isn't one" value={d.exam} onChange={(e) => set("exam", e.target.value)} />
            </div>
          )}
          <div className="rm-f">
            <span className="st-label">How hard</span>
            <Segmented className="rm-seg-fill" value={d.intensity} label="How hard" onChange={(v) => set("intensity", v)} options={INTENSITIES.map((i) => ({ value: i, label: INTENSITY_WORD[i] }))} />
            <p className="st-hint">{fieldArea ? paceShareHint(d.intensity) : intensityHint()}</p>
          </div>
          {askCards && (
            <div className="rm-f" id="rm-f-newCards">
              <label className="st-label" htmlFor={ids.newCards}>
                New cards a week{" "}
                <span className="rm-opt">
                  {newCardsRequired ? "needed" : "optional"} · {NEW_CARDS_PER_WEEK_MIN} to {NEW_CARDS_PER_WEEK_MAX}
                </span>
              </label>
              <input id={ids.newCards} className="st-input rm-num" inputMode="numeric" placeholder="e.g. 4" value={d.newCards} onChange={(e) => set("newCards", e.target.value.replace(/[^\d]/g, ""))} />
              <p className="st-hint">{newCardsRequired ? NEW_CARDS_REQUIRED_HINT : "How many new cards a week will you write for this? Leave it blank and new cards won't be counted until your pace is measured."}</p>
              {problem("newCards")}
            </div>
          )}
          <details className="rm-adv" id="reality" open={Boolean(d.typicalHours) || Boolean(problems.typicalHours)}>
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
            <p className="st-hint">The app leaves out practice types your constraints rule out, and lists each one with its word.</p>
          </div>
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
              {fieldArea && gapsLive && geminiLive && (
                <div className="rm-sw">
                  <span className="rm-sw-t">{SUGGEST_AREAS_LABEL}</span>
                  <Switch checked={d.suggestAreas === true} onChange={(v) => set("suggestAreas", v)} label={SUGGEST_AREAS_LABEL} />
                </div>
              )}
              {geminiLive && (
                <p className="st-hint" style={{ margin: 0 }}>
                  {privacyLine(PACK_SECTIONS)}
                </p>
              )}
              {geminiLive && view.keyTier === "FREE" && (
                <p className="st-hint" style={{ margin: 0 }}>
                  {FREE_TIER_LINE}
                </p>
              )}
            </div>
          </details>
        </section>

        <div className="rm-sticky" data-kb={inset > 0 ? "1" : undefined} style={inset > 0 ? ({ ["--kb" as string]: `${inset}px` } as CSSProperties) : undefined}>
          {geminiLive ? (
            <>
              <Button type="submit" variant="primary" size="lg" disabled={busy != null}>
                {busy === "GEMINI" ? "Saving…" : "Draft with Gemini"}
              </Button>
              <Button size="lg" disabled={busy != null} onClick={() => void submit("STARTER")}>
                {busy === "STARTER" ? "Building…" : "Build from my numbers"}
              </Button>
              <p className="t-meta">{geminiArrangesLine(lines.length, chosen.length + named.length)}</p>
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
          {view.activeRoadmapId && !d.replaces && (
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
