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
 *   Domains: picking the Area chooses only the ones the aim names (F-R5-8,
 *   lane 1: domainPrefillOf, lineDomainDefaultOf's rule; cards held choose
 *   nothing; at that moment only, a later aim edit never moves a chip), the
 *   rest folded under "Left out · n", one tap to add each (focus follows the
 *   chip that moved); "+ Domain from another Field"; "Name the areas this
 *   needs" with any library (chosen and named together up to
 *   DEPTH_DOMAINS_MAX; none of either is refused before saving, naming what
 *   the user can do there); "How many cards each Domain needs" (every term
 *   of every Domain's count, Edit, the lines tied to no Domain) · By when
 *   ("When realistic" first and pressed; each
 *   chosen chip with its floor verdict, none hidden or disabled) · Hours ·
 *   Exam (Yes / No, prefilled from the aim, with its name and its optional
 *   date: a waypoint) · Outline (each line's Domain, prefilled by a
 *   deterministic match and changed by the user) · How hard (the share of the
 *   usual pace the plan counts on) · New cards a week (required when the app
 *   needs a pace to date the plan) · Reality check · Constraints · Advanced.
 * On a body or care track Area (always), or a craft one whose words carry a
 * cue, the activity question opens under Constraints (contracts §19,
 * IntakeActivities): which activities the plan should avoid, a box pre-ticked
 * where the user's own words suggest it. [Confirm these] (a box ticked) or
 * [Nothing to avoid] keeps the answer on the form, with the key of the words
 * it was given against; it is saved right after the intake
 * (setActivityVerdicts), before the plan is built, and only while the words
 * on the form are still those. Unconfirmed, or refused because the words
 * changed, the draft asks, and the plan keeps to the track's easy kinds until
 * it is answered.
 * A Field Area with practices on asks FAMILY_QUESTION (contracts §20.11):
 * which kind of skill the aim trains (knowledge, a language, doing or
 * playing, making things), prefilled by code's reading of the aim
 * (practiceFamilyPrefillOf); only the user's own answer is sent
 * (Intake.practiceFamily), so an untouched one follows the aim.
 * A life-track Area keeps rev 3's: a chosen date (12 months by default),
 * Where you're starting, no depth.
 *
 * Gemini appears only while ROADMAP_GEMINI_LIVE and a key both hold (the
 * view's hasKey): [Draft with Gemini] says what it will arrange, naming only
 * what the run will ask (geminiAsksOf). With nothing to ask (a Field Area
 * with practices off, no outline and every Domain chosen: the v4 schema
 * would be empty) only [Build from my numbers] is offered, with
 * GEMINI_NOTHING_TO_ASK_LINE. Otherwise
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
 *
 * UI motion (lane R7; ui-motion.md §3.3 screen 1, §7.1): fewer words, the
 * full text one tap away. The form lead sits behind the (i) beside "Your
 * aim"; the aim's question, AIM_LONG_HINT and "Shown exactly as you wrote
 * it" are the textarea's description, held in the card Key ([m.verbatim]
 * beside the n/140). Depth is a StageLadder over the stage buttons
 * ("Mastered L12"), «review gap ≈ 110 d», and one (i) holding depthHint,
 * realisticHint and the exam waypoint, said once. By when: verdict chips
 * "[t.cal] 12 mo" over "[v.fits] possible" or "[v.imp] too soon for L12"
 * (each chip's full verdict is its name). Hours: the stepper and a StatRow
 * "≈ 9 h 10 seen · 5 h/wk yours" «not timed» (with the Field's cards). Exam
 * and Syllabus are ▸ disclosures; How hard is "[intensity] Light 50%";
 * Constraints is "Anything to avoid?". The paths: «from your numbers», or
 * the Gemini lanes "Gemini: … / App: …" with «Google may use this». Each
 * card's explanations fold into its Key. Motion: ladder, verdict-change and
 * bars, each the user's own pick (ACT). No shader (data-fx="none"); the
 * words are counted as §3.2 row 1 (data-wc-block="intake", the fold marked
 * data-wc-fold).
 */
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { Icon, Sigil } from "@/components/ui/Icon";
import { Segmented, Switch } from "@/components/ui/Tabs";
import { Sheet } from "@/components/ui/Sheet";
import { pushToast } from "@/components/ui/toast-store";
import { ActionError } from "@/components/home/ActionError";
import { Glyph } from "@/components/glyph/Glyph";
import { GlyphLane } from "@/components/glyph/GlyphLane";
import { Fig, StatRow, type GlyphStatProps } from "@/components/glyph/GlyphStat";
import { Chips, HonestyChip } from "@/components/glyph/HonestyChip";
import { CardKey, InfoTip, type KeyEntry } from "@/components/glyph/InfoTip";
import { StageLadder } from "@/components/glyph/StageLadder";
import { GLYPH_MEANS } from "@/components/glyph/paths/means";
import { playGlyph } from "@/lib/glyph-motion";
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
  INTENSITY,
  NEW_CARDS_PER_WEEK_MAX,
  NEW_CARDS_PER_WEEK_MIN,
  PACK_SECTIONS,
  PRACTICE_FAMILIES,
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
  cueTextsOf,
  examPrefillOf,
  floorBase,
  isPracticeFamily,
  milestoneCountFor,
  practiceFamilyPrefillOf,
  type ActivityCardAnswer,
  type CoverageBreakdown,
  type DateMode,
  type AimDepth,
  type DepthKey,
  type Intake,
  type IntakeFieldOption,
  type IntakeView,
  type Intensity,
  type PracticeFamily,
  type StartPoint,
} from "@/lib/roadmap-types";
import { aimDomainDefaultsOf, coverageOf, lineDomainDefaultOf } from "@/lib/roadmap-realism";
import { VAGUE_AIM_IDLE_MS, vagueAimHint } from "@/lib/roadmap-invite";
import { takeAimHandoff, type StoredAimHandoff } from "@/lib/roadmap-handoff";
import { clearSheetDraftIf } from "@/lib/idea-handoff";
import {
  ACTIVITY_NOT_SAVED_LINE,
  AIM_CALL_PLACEHOLDER,
  AIM_LONG_HINT,
  APP_LANE_ITEMS,
  COVERAGE_TITLE,
  DOMAINS_PREFILL_LINE,
  GEMINI_LANE_ITEM,
  LEFT_OUT_WORD,
  NO_AREAS_NAMED_LINE,
  NO_DOMAINS_LINE,
  SHORT_AIM_LABEL,
  SHORT_ANYTHING_TO_AVOID,
  SHORT_DATA,
  SHORT_EXAM_OPTIONAL,
  SHORT_NO_KEY,
  SHORT_NOT_TIMED,
  SHORT_PICK_AREA,
  SHORT_REVIEW_GAP,
  SHORT_SEEN,
  SHORT_SYLLABUS_OPTIONAL,
  SHORT_YOURS,
  depthGapDays,
  dayFull,
  shortTooSoon,
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
  GEMINI_NOTHING_TO_ASK_LINE,
  FAMILY_HINT,
  FAMILY_PREFILL_HINT,
  FAMILY_QUESTION,
  FAMILY_WORD,
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
import { IntakeActivities } from "./ActivityConfirm";
import { geminiAsksOf, intakeActivityOf } from "./roadmap-ui-model";
import type { LiveGates } from "./GapPanel";
// ── Revision 5, lane 9: the TOPICS paths ([Write the topics]; [Break it down] only while topicSwitchesOf().rate), behind TOPIC_PLANS_LIVE ──
import { topicSwitchesOf } from "@/lib/roadmap-types";
import { topicPlansOn } from "./topic-map-model";
import { BREAK_IT_DOWN_WORD, TOPIC_PATHS_LABEL, WRITE_TOPICS_LINE, WRITE_TOPICS_WORD } from "./roadmap-copy";
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
  /** "Name the areas this needs" (any library since F-R5-8; chosen and named together hold up to DEPTH_DOMAINS_MAX). */
  newDomainNames?: string[];
  /** Area suggestions (only while ROADMAP_GAPS_LIVE). */
  suggestAreas?: boolean;
  /** "Start again at a depth": the legacy roadmap saving this archives. */
  replaces?: string | null;
  /**
   * The practice family (contracts §20.11; a Field Area): the user's answer
   * to FAMILY_QUESTION; null until answered (the aim prefills it,
   * practiceFamilyPrefillOf, and the server reads that same prefill).
   */
  practiceFamily?: PracticeFamily | null;
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
    practiceFamily: null,
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
    practiceFamily: isPracticeFamily(i.practiceFamily) ? i.practiceFamily : null,
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

/** The practice family in force (contracts §20.11): the user's answer, else code's reading of the aim and the exam's name (practiceFamilyPrefillOf). */
export function practiceFamilyAnswerOf(d: Pick<IntakeDraft, "practiceFamily" | "aim" | "exam" | "examAnswer">): PracticeFamily {
  if (isPracticeFamily(d.practiceFamily)) return d.practiceFamily;
  return practiceFamilyPrefillOf(d.aim, examAnswerOf(d) ? d.exam : null);
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

/**
 * The Domains a Field Area starts with (F-R5-8, lane 1): none, except each Domain of the Field whose name's content
 * stems all appear in the aim (realism's aimDomainDefaultsOf, lineDomainDefaultOf's own rule), never one another goal
 * holds (IntakeView.takenDomains), at most DEPTH_DOMAINS_MAX. Cards held choose nothing. The rest wait under
 * "Left out · n", one tap to add each.
 */
export function domainPrefillOf(aim: string, field: Pick<IntakeFieldOption, "domains">, taken?: IntakeView["takenDomains"]): string[] {
  const free = field.domains.filter((dm) => !(taken && Object.prototype.hasOwnProperty.call(taken, dm.id)));
  return aimDomainDefaultsOf(aim, free).slice(0, DEPTH_DOMAINS_MAX);
}

/**
 * Where focus goes once a Domain chip moves between "Domains" and "Left out" (F-R5-8; the tapped button unmounts):
 * the next chip of the group it left, else the one before it, else `last` (the fold's summary, or the chip it became).
 */
export function chipFocusAfterOf(group: readonly string[], id: string, last: string): string {
  const i = group.indexOf(id);
  return (i < 0 ? undefined : (group[i + 1] ?? group[i - 1])) ?? last;
}

/**
 * What "Name the areas this needs" does with the typed text (F-R4-24; any library since F-R5-8), Enter and Add alike.
 * One cap with the chosen Domains, as intakeOf's and the server's: chosen and named together hold up to
 * DEPTH_DOMAINS_MAX. A name the Area already has is that Domain ("pick": chosen instead, as the server would refuse it
 * as a new one; "chosen": it already is, the text just clears); any other is a new name. null: nothing to do (no text,
 * a name already listed, or no room left).
 */
export function namedAreaAddOf(
  text: string,
  names: readonly string[],
  chosen: readonly string[],
  library: readonly { id: string; name: string }[]
): { kind: "pick"; id: string } | { kind: "chosen" } | { kind: "name"; name: string } | null {
  const n = text.replace(/\s+/g, " ").trim();
  if (!n) return null;
  const full = names.length >= Math.max(0, DEPTH_DOMAINS_MAX - chosen.length);
  const own = library.find((x) => x.name.replace(/\s+/g, " ").trim().toLowerCase() === n.toLowerCase());
  if (own) return chosen.includes(own.id) ? { kind: "chosen" } : full ? null : { kind: "pick", id: own.id };
  if (full || names.some((x) => x.toLowerCase() === n.toLowerCase())) return null;
  return { kind: "name", name: n };
}

/**
 * The form once a Field is picked as the Area (pickField): the Field, the track, the date mode, and the Domains the
 * aim names (domainPrefillOf). A saved intake never passes here: a draft, a re-plan or an edit loads its own Domains.
 */
export function pickFieldDraft(x: IntakeDraft, f: IntakeFieldOption, taken?: IntakeView["takenDomains"]): IntakeDraft {
  return {
    ...x,
    fieldId: f.id,
    areaTrack: null,
    track: x.areaTrack ? DEFAULT_FIELD_TRACK : x.track,
    domainIds: domainPrefillOf(x.aim, f, taken),
    // A Field Area dates the plan when realistic, unless a date was handed over or picked.
    dateMode: x.areaTrack ? "REALISTIC" : (x.dateMode ?? "REALISTIC"),
  };
}

/**
 * The form an aim handed over fills when no DRAFT is open (the /you card, a long goal, capture, "Start again at a
 * depth"): its aim; its date; the Area when its Field is one of the intake's (or a track Area with its track), with the
 * old plan's own Domains when the handoff carried them, otherwise only the ones the aim names (domainPrefillOf, as
 * pickField; F-R5-8); and what it replaces. `base` is the stored unsent form, or a blank one.
 */
export function handoffDraftOf(
  base: IntakeDraft,
  h: Pick<StoredAimHandoff, "aim" | "targetDay" | "areaFieldId" | "track" | "domainIds" | "replaces">,
  fields: readonly IntakeFieldOption[],
  taken?: IntakeView["takenDomains"]
): IntakeDraft {
  const field = h.areaFieldId ? fields.find((f) => f.id === h.areaFieldId) : null;
  return {
    ...base,
    aim: h.aim.slice(0, AIM_MAX),
    ...(h.targetDay ? { targetDay: h.targetDay, dateMode: "CHOSEN" as const } : {}),
    ...(field ? { fieldId: field.id, areaTrack: null, track: h.track ?? base.track, domainIds: h.domainIds?.length ? [...h.domainIds] : domainPrefillOf(h.aim.slice(0, AIM_MAX), field, taken) } : {}),
    ...(!field && h.areaFieldId === null && h.track ? { fieldId: null, areaTrack: h.track, track: h.track, domainIds: [], dateMode: "CHOSEN" as const } : {}),
    ...(h.replaces ? { replaces: h.replaces } : {}),
  };
}

/**
 * The client's checks (the server re-validates every field). Returns the Intake, or the first problem per field.
 * `fields` (the form passes IntakeView.fields): a Field Area the form no longer lists (a stored form or a draft whose
 * Field went) asks for the Area again, where the form can show it; an empty library's "no Domain" asks for a name.
 */
export function intakeOf(
  d: IntakeDraft,
  today: string,
  opts: { chosen?: readonly { id: string; name: string }[]; newCardsRequired?: boolean; fields?: readonly Pick<IntakeFieldOption, "id" | "domains">[] } = {}
): { intake: Intake | null; problems: Partial<Record<IntakeField, string>> } {
  const problems: Partial<Record<IntakeField, string>> = {};
  const aim = d.aim.replace(/\s+/g, " ").trim();
  if (!aim) problems.aim = "Say what you want to be able to do.";
  else if (aim.length > AIM_MAX) problems.aim = `At most ${AIM_MAX} characters.`;
  // undefined: not known here (no `fields`); null: a Field the form no longer lists.
  const areaField = d.fieldId && opts.fields ? (opts.fields.find((f) => f.id === d.fieldId) ?? null) : undefined;
  if (!d.fieldId && !d.areaTrack) problems.area = "Pick the Area this grows: one of your Fields, or a life track.";
  else if (areaField === null) problems.area = "That Field no longer exists. Pick the Area this grows.";
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
  // None chosen or named (F-R5-8: the form now starts with none): every plan path refuses it, so the form says so before
  // it saves, in words naming what the user can do there (an empty library has only "Name the areas this needs").
  else if (!trackArea && areaField !== null && d.domainIds.length + named.length === 0) problems.domains = areaField?.domains.length === 0 ? NO_AREAS_NAMED_LINE : NO_DOMAINS_LINE;
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
      // The practice family (contracts §20.11): the user's answer only; untouched, the server reads the same prefill over the aim.
      ...(!trackArea && isPracticeFamily(d.practiceFamily) ? { practiceFamily: d.practiceFamily } : {}),
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
 * A Domain chip's compact count, "48 cards · 6 multiple choice not counted · 18 at L6+": the counting caveat stays in
 * view (the 48 is not what the plan counts), only "level 6+" compacts to "L6+" (aria-hidden; domainChipCount is its
 * spoken twin and the card Key's line, D26, D13).
 */
export function domainChipCompact(x: Pick<IntakeFieldOption["domains"][number], "cards" | "atSix" | "nonRecall">): string {
  return `${recallCountLine(x.cards, nonRecallOf(x))} · ${x.atSix} at L6+`;
}

/** "9 hours 10 minutes": a tracked time's spoken twin (hoursLabel's "9 h 10" in words). */
export function hoursSpeech(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const hours = h === 1 ? "1 hour" : `${h} hours`;
  const mins = r === 1 ? "1 minute" : `${r} minutes`;
  return h === 0 ? mins : r === 0 ? hours : `${hours} ${mins}`;
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
 * only the Domains the aim names (domainPrefillOf, F-R5-8). The 'restart'
 * note names only these.
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

type Path = "GEMINI" | "STARTER" | "MANUAL" | "TOPICS" | "BREAKDOWN";

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

/**
 * The Depth control (F-R4-9): the stage name over its level, Mastered first; a lower depth is the user's choice.
 * The stage is a name (data-wc="name"); the level is "L12", spoken "level 12" (D26). StageLadder above it is its
 * aria-hidden visual twin (D6); these buttons stay the control.
 */
function DepthControl({ value, onChange, id }: { value: DepthKey; onChange: (v: DepthKey) => void; id?: string }) {
  return (
    <div id={id} className="segc rm-seg-fill rm-seg-two" role="group" aria-label="Depth">
      {DEPTH_KEYS.map((k) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          <b data-wc="name">{depthStage(AIM_DEPTHS[k])}</b>
          <small aria-hidden="true">L{AIM_DEPTHS[k]}</small>
          <span className="sr-only">level {AIM_DEPTHS[k]}</span>
        </button>
      ))}
    </div>
  );
}

/** A By-when chip's words: "12 mo" (spoken "12 months"); the longest is "3 years". */
export function whenChipLabel(months: number): { label: string; spoken: string } {
  return months === 36 ? { label: "3 years", spoken: "3 years" } : { label: `${months} mo`, spoken: `${months} months` };
}

/**
 * A By-when chip (ui-motion.md §3.3 screen 1): "[t.cal] 12 mo" and, on a Field Area, its verdict under it,
 * "[v.fits] possible" or "[v.imp] too soon for L12" (a verdict chip: the verdict glyph sits only here, D27). The
 * visible words are aria-hidden; the chip's name is the full verdict, "12 months before level 12 is possible"
 * (chipVerdict, verbatim). When a depth pick changes the verdict, its glyph plays verdict-change (ACT: the user's own
 * pick; nothing on arrival).
 */
function WhenChip({ months, pressed, onPick, possible, depth }: { months: 3 | 6 | 12 | 24 | 36; pressed: boolean; onPick: () => void; possible: boolean | null; depth: AimDepth }) {
  const ref = useRef<SVGSVGElement>(null);
  const prev = useRef<boolean | null>(null);
  useEffect(() => {
    if (possible != null && prev.current != null && prev.current !== possible) void playGlyph(ref.current, "verdict-change", { licence: "ACT" });
    prev.current = possible;
  }, [possible]);
  const { label, spoken } = whenChipLabel(months);
  return (
    <ChipButton className={possible != null ? "rm-chip-two rm-in-when" : "rm-in-when"} pressed={pressed} onClick={onPick}>
      <span className="rm-in-when-l" aria-hidden="true">
        <Glyph name="t.cal" size={12} inherit />
        {label}
      </span>
      {possible != null && (
        <small className="rm-in-when-v" aria-hidden="true">
          <Glyph ref={ref} name={possible ? "v.fits" : "v.imp"} state={pressed ? "active" : "idle"} size={12} inherit />
          {possible ? chipVerdict(true, depth) : shortTooSoon(depth)}
        </small>
      )}
      <span className="sr-only">{possible != null ? `${spoken} ${chipVerdict(possible, depth)}` : spoken}</span>
    </ChipButton>
  );
}

const INTENSITY_GLYPH: Readonly<Record<Intensity, "intensity.light" | "intensity.steady" | "intensity.push">> = { LIGHT: "intensity.light", STEADY: "intensity.steady", PUSH: "intensity.push" };

/**
 * How hard (ui-motion.md §3.3 screen 1): "[intensity.light] Light 50% · [intensity.steady] Steady 70% ·
 * [intensity.push] Push 90%", the share from INTENSITY (never typed). A pick plays `bars` on its glyph (ACT).
 * intensityHint / paceShareHint is the group's description, held in the card Key.
 */
function HardControl({ value, onChange, labelledBy, describedBy }: { value: Intensity; onChange: (v: Intensity) => void; labelledBy: string; describedBy?: string }) {
  const glyphs = useRef<Partial<Record<Intensity, SVGSVGElement | null>>>({});
  return (
    <div className="segc rm-seg-fill rm-in-hard" role="group" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      {INTENSITIES.map((i) => (
        <button
          key={i}
          type="button"
          aria-pressed={value === i}
          onClick={() => {
            if (value === i) return;
            onChange(i);
            void playGlyph(glyphs.current[i], "bars", { licence: "ACT" });
          }}
        >
          <Glyph
            ref={(el) => {
              glyphs.current[i] = el;
            }}
            name={INTENSITY_GLYPH[i]}
            state={value === i ? "active" : "idle"}
            size={16}
            inherit
          />
          {INTENSITY_WORD[i]}
          <span className="rm-in-pct">{Math.round(INTENSITY[i] * 100)}%</span>
        </button>
      ))}
    </div>
  );
}

/** A line of a card Key's text (the explanations a card folds away; D13). `id`: a control's description reads it. */
function KeyLine({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span className="rm-in-kl" id={id}>
      {children}
    </span>
  );
}

/** A card's Key, at the card's foot: the glyphs it draws with their words, and the lines it folds away. */
function FormKey({ entries, rows, children }: { entries: readonly KeyEntry[]; rows?: readonly ReactNode[]; children?: ReactNode }) {
  return (
    <div className="rm-in-key">
      <CardKey entries={entries} rows={rows} topic="this part of the form">
        {children}
      </CardKey>
    </div>
  );
}

/** A disclosure's glyph in its summary (a span, so the summary's chevron rule never turns it). */
function SummaryGlyph({ name }: { name: "quest.checkpoint" | "pv.syllabus" }) {
  return (
    <span className="rm-in-sg" aria-hidden="true">
      <Glyph name={name} size={16} inherit />
    </span>
  );
}

/**
 * "Name the areas this needs" (F-R4-24; any library since F-R5-8): the user's own names, created in the Area Field
 * when the intake saves. One cap with the chosen Domains (`chosen`), as intakeOf's and the server's: chosen and named
 * together hold up to DEPTH_DOMAINS_MAX, so the label reads the names' room ("up to n") while there is one, and the
 * count against the cap once it is full. A name the Area already has is that Domain, chosen instead (the server
 * refuses it as a new one: "pick it instead"), within the same cap. Enter and Add agree. Its hint (an empty library
 * only) is the field's description, in the card Key; `problem` is the empty library's refusal, under the field.
 */
function NamedAreas({
  names,
  onChange,
  chosen,
  describedBy,
  library = [],
  onPick,
  problem,
}: {
  names: readonly string[];
  onChange: (n: string[]) => void;
  chosen: readonly string[];
  describedBy?: string;
  library?: readonly { id: string; name: string }[];
  onPick?: (id: string) => void;
  problem?: ReactNode;
}) {
  const [text, setText] = useState("");
  const id = useId();
  // The names the plan still holds beside the chosen Domains; full when no name (and no Domain picked by its name) fits.
  const room = Math.max(0, DEPTH_DOMAINS_MAX - chosen.length);
  const full = names.length >= room;
  const total = chosen.length + names.length;
  const add = () => {
    const next = namedAreaAddOf(text, names, chosen, onPick ? library : []);
    if (!next) return;
    if (next.kind === "pick") onPick?.(next.id);
    else if (next.kind === "name") onChange([...names, next.name]);
    setText("");
  };
  return (
    <div className="rm-f" id="rm-f-named">
      <label className="st-label" htmlFor={id}>
        {NAME_AREAS_LABEL}{" "}
        <span className="rm-opt">{full ? <Fig compact={`${total}/${DEPTH_DOMAINS_MAX}`} speech={`${total} chosen, up to ${DEPTH_DOMAINS_MAX}`} /> : `up to ${room}`}</span>
      </label>
      <div className="rm-named">
        <input
          id={id}
          className="st-input"
          value={text}
          maxLength={80}
          placeholder="An area, in your words"
          aria-describedby={describedBy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button onClick={add} disabled={!text.trim() || full}>
          Add
        </Button>
      </div>
      {names.length > 0 && (
        <div className="rm-dchips" style={{ marginTop: 8 }}>
          {names.map((n) => (
            <button key={n} type="button" className="rm-dchip" aria-pressed aria-label={`Remove ${n}`} onClick={() => onChange(names.filter((x) => x !== n))}>
              <b data-wc="own">{n}</b>
              <span>a new Domain · tap to remove</span>
            </button>
          ))}
        </div>
      )}
      {problem}
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
            <span className="t-eyebrow" data-wc={g.id ? "name" : undefined}>
              {g.name}
            </span>
            {rows.map(({ l, i }) => (
              <div key={`${i}:${l}`} className="rm-lrow">
                <span className="rm-lrow-k">S{i + 1}</span>
                <span className="rm-lrow-t" data-wc="own">
                  {l}
                </span>
                <select
                  className="st-input rm-lrow-sel"
                  aria-label={`Change the Domain of S${i + 1}`}
                  data-wc={domains[i] ? "name" : undefined}
                  value={domains[i] ?? ""}
                  onChange={(e) => onChange(l, e.target.value)}
                >
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

export function RoadmapForm({
  view,
  gates,
  pick,
}: {
  view: IntakeView;
  /** Fixtures only: draw a lead-only state. */ gates?: LiveGates;
  /** Fixtures only: the aim as typed, then this Field picked (pickField's own draft), with no open DRAFT. */ pick?: { aim: string; fieldId: string };
}) {
  const runtime = useRoadmapRuntime();
  const ids = { aim: useId(), date: useId(), hours: useId(), newCards: useId(), typical: useId(), source: useId(), constraints: useId(), exam: useId(), examDay: useId(), syllabus: useId(), sylSource: useId() };
  // The card Keys' lines the controls read as their descriptions (D13), and the labels the custom groups name.
  const keyIds = { aim: useId(), area: useId(), named: useId(), date: useId(), hours: useId(), hard: useId(), constraints: useId(), newCards: useId(), depthLabel: useId(), depthGroup: useId(), hardLabel: useId() };
  const [d, setD] = useState<IntakeDraft>(() => {
    if (view.draft) return draftOfIntake(view.draft.intake);
    const blank = emptyIntakeDraft(view.today);
    const picked = pick ? view.fields.find((f) => f.id === pick.fieldId) : undefined;
    return pick && picked ? pickFieldDraft({ ...blank, aim: pick.aim.slice(0, AIM_MAX) }, picked, view.takenDomains) : blank;
  });
  const [restored, setRestored] = useState(false);
  const [handoff, setHandoff] = useState<StoredAimHandoff | null>(null);
  // The handed-over aim reached the form (the no-draft merge, or "Use it" on an open draft): only then does the capture line go.
  const [handoffUsed, setHandoffUsed] = useState(false);
  // A link to #syllabus opens the outline and focuses its box.
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  // "Left out · n" (F-R5-8): the user's own toggle; un-choosing a Domain opens it, so the chip stays in sight.
  const [leftOpen, setLeftOpen] = useState(false);
  // A Domain chip that moves between "Domains" and "Left out" unmounts the button that had focus: the Domain id whose
  // chip takes focus once the move renders ("" for none), then the fold's summary, then "+ Domain from another Field".
  const focusAfter = useRef<string | null>(null);
  const chipEls = useRef(new Map<string, HTMLButtonElement>());
  const leftSummary = useRef<HTMLElement>(null);
  const otherAdd = useRef<HTMLButtonElement>(null);
  const [problems, setProblems] = useState<Partial<Record<IntakeField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Path | null>(null);
  const [vague, setVague] = useState(false);
  // The Exam disclosure (a Field Area): open while the aim says there is an exam and it has no name yet, and it stays
  // open (the user's own toggle after that), so typing the name's first letter never folds it away.
  const [examOpen, setExamOpen] = useState(false);
  // Constraint safety (contracts §19): the activity card's answer the user confirmed on this form, with its words' key (saved right after the intake).
  const [activityAnswer, setActivityAnswer] = useState<ActivityCardAnswer | null>(null);
  const loaded = useRef(false);
  // Set by the user's own edits only: a visit that changes nothing stores nothing.
  const dirty = useRef(false);
  const inset = useKeyboardInset();
  // The fixtures (/dev/style/roadmap, the checks) never read or write the device's stored form.
  const storage = !runtime.fixture;
  const geminiLive = (gates?.gemini ?? ROADMAP_GEMINI_LIVE) && view.hasKey;
  const gapsLive = gates?.gaps ?? ROADMAP_GAPS_LIVE;
  // Revision 5, lane 9 (F-R5-7; ui-motion §15.8): with TOPIC_PLANS_LIVE off the intake renders nothing new.
  const topicsLive = topicPlansOn(gates);
  const breakDownLive = topicsLive && (gates?.topics === true ? Boolean(gates.gemini) : topicSwitchesOf().rate) && view.hasKey;

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
      // The old plan's own Domains when the handoff carried them; otherwise only the ones the aim names (F-R5-8), as pickField.
      const next = handoffDraftOf({ ...emptyIntakeDraft(view.today), ...(stored ?? {}) }, h, view.fields, view.takenDomains);
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
  }, [view.draft, view.today, view.fields, view.takenDomains, storage]);

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

  // Focus follows a Domain chip's move (F-R5-8): never left on <body> when the tapped chip unmounts.
  useEffect(() => {
    const to = focusAfter.current;
    if (to == null) return;
    focusAfter.current = null;
    ((to ? chipEls.current.get(to) : null) ?? leftSummary.current ?? otherAdd.current)?.focus();
  }, [d.domainIds]);

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
  // What "Draft with Gemini" would ask (contracts §20.5): the outline's order, other Domains, one practice per stage. Nothing to ask
  // (practices off, no outline, every Domain of the Area chosen): the v4 schema would be empty, so only the app's build is offered.
  const asks = geminiAsksOf({
    fieldArea,
    lines: lines.length,
    otherDomains: field ? field.domains.filter((x) => !d.domainIds.includes(x.id)).length : 0,
    chosenDomains: chosen.length + named.length,
    practicesAllowed: trackArea || d.practicesAllowed,
  });
  const askGemini = geminiLive && asks != null;
  const coverage = useMemo(() => (fieldArea ? coveragePreviewOf(chosen, named, lineDomains, d.coverage) : []), [fieldArea, chosen, named, lineDomains, d.coverage]);
  const unassigned = lines.map((_, i) => i).filter((i) => lineDomains[i] == null);
  const paceMeasured = view.paceRate != null || !asksNewCards(field, d.domainIds);
  // Needed only when a Domain is short of its count: the spare alone is dated on the cards held (newCardsRequiredOf).
  const newCardsRequired = newCardsRequiredOf(realistic, coverage, paceMeasured);
  const askCards = fieldArea && (newCardsRequired || asksNewCards(field, d.domainIds));
  const exam = trackArea ? d.exam.trim().length > 0 : examAnswerOf(d);
  // An exam with no name yet opens its disclosure (React's "adjust state while rendering": once, never closing it under the user).
  if (fieldArea && exam && !d.exam.trim() && !examOpen) setExamOpen(true);
  // The practice family (contracts §20.11): the user's answer, else the aim's prefill.
  const family = practiceFamilyAnswerOf(d);
  const emptyLibrary = fieldArea && field!.domains.length === 0;
  // The Area's Domains not chosen (the aim doesn't name them, or the user took them out): folded under "Left out · n", one tap to add each (F-R5-8).
  const leftOut = field ? field.domains.filter((dm) => !d.domainIds.includes(dm.id)) : [];
  // The chosen chips in the order they render: the Area's own, then those from other Fields.
  const chosenChips = field ? [...field.domains.filter((dm) => d.domainIds.includes(dm.id)).map((dm) => dm.id), ...d.domainIds.filter((id) => !field.domains.some((dm) => dm.id === id) && allDomains.has(id))] : [];
  // Constraint safety (contracts §19): a body or care track Area asks which activities to avoid, from the words as typed; a craft one when its words carry a cue.
  const gatedTrack = trackArea && (d.areaTrack === "BODY" || d.areaTrack === "CARE" || d.areaTrack === "CRAFT") ? d.areaTrack : null;
  const storedActivities = view.draft?.intake.activities ?? null;
  const activity = useMemo(() => {
    if (!gatedTrack) return null;
    const examLabel = exam ? d.exam.trim() || null : null;
    const texts = cueTextsOf({
      constraints: d.constraints.trim() || null,
      aim: d.aim.replace(/\s+/g, " ").trim(),
      examLabel,
      typicalHoursSource: d.typicalHours.trim() && d.typicalSource.trim() ? d.typicalSource.trim() : null,
      syllabus: lines.length > 0 ? { lines, source: d.syllabusSource.trim() || null } : null,
    });
    return intakeActivityOf({ track: gatedTrack, texts, exam, practicesAllowed: true, examLabel, stored: storedActivities });
  }, [gatedTrack, exam, d.exam, d.constraints, d.aim, d.typicalHours, d.typicalSource, d.syllabusSource, lines, storedActivities]);

  // Picking a Field preselects only the Domains the aim names (F-R5-8): the rest fold under "Left out · n".
  const pickField = (f: IntakeFieldOption) => {
    edit((x) => pickFieldDraft(x, f, view.takenDomains));
    setAreaOpen(false);
  };
  const pickTrack = (t: Track) => {
    edit((x) => ({ ...x, fieldId: null, areaTrack: t, track: t, domainIds: [], practicesAllowed: true, dateMode: "CHOSEN", targetDay: x.dateMode === "REALISTIC" ? addMonths(view.today, 12) : x.targetDay }));
    setAreaOpen(false);
  };
  const toggleDomain = (id: string) => edit((x) => ({ ...x, domainIds: x.domainIds.includes(id) ? x.domainIds.filter((y) => y !== id) : [...x.domainIds, id] }));
  const chooseDomain = (id: string) => edit((x) => (x.domainIds.includes(id) ? x : { ...x, domainIds: [...x.domainIds, id] }));
  // A chosen chip taken out: the Area's own goes under "Left out" (opened); focus moves to the next chosen chip, else the fold.
  const unchooseChip = (id: string) => {
    focusAfter.current = chipFocusAfterOf(chosenChips, id, "");
    if (field?.domains.some((dm) => dm.id === id)) setLeftOpen(true);
    toggleDomain(id);
  };
  // A Domain added from "Left out": focus moves to the next one left out, else to the chip it became.
  const chooseLeftOut = (id: string) => {
    focusAfter.current = chipFocusAfterOf(leftOut.map((dm) => dm.id), id, id);
    chooseDomain(id);
  };
  // The chip's button by Domain id, for focusAfter (React 19's ref cleanup drops it only while it is still this one).
  const chipRef = (id: string) => (el: HTMLButtonElement | null) => {
    if (!el) return;
    const els = chipEls.current;
    els.set(id, el);
    return () => {
      if (els.get(id) === el) els.delete(id);
    };
  };
  const pickDate = (day: string) => edit((x) => ({ ...x, targetDay: day, dateMode: "CHOSEN" }));

  const submit = async (path: Path) => {
    setError(null);
    const { intake: formIntake, problems: p } = intakeOf(d, view.today, { chosen, newCardsRequired, fields: view.fields });
    setProblems(p);
    if (!formIntake) {
      const first = Object.keys(p)[0];
      // An empty library has no Domains row: its refusal sits under "Name the areas this needs".
      (document.getElementById(`rm-f-${first}`) ?? (first === "domains" ? document.getElementById("rm-f-named") : null))?.scrollIntoView({ block: "center" });
      return;
    }
    // Revision 5, lane 9 (ruling 14): a TOPICS intake carries topicDepth (6 or the depth you chose) with depth null.
    const topicsPath = path === "TOPICS" || path === "BREAKDOWN";
    const intake: Intake = topicsPath ? { ...formIntake, planKind: "TOPICS", topicDepth: formIntake.depth ?? 6, depth: null } : formIntake;
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
      // The activity card's answer confirmed on this form, given against these words (contracts §19; its key). Not saved (refused, or the words changed): the draft asks again.
      if (activity && activityAnswer && activityAnswer.key === activity.key) {
        const answered = await runtime.actions.setActivityVerdicts(id, activityAnswer).catch(() => null);
        if (!answered?.ok) pushToast({ title: "Activity answer not saved", body: ACTIVITY_NOT_SAVED_LINE });
      }
      // Revision 5, lane 9: the topic paths after the level plan's three (TOPICS: [Write the topics]; BREAKDOWN: [Break it down]).
      const next = path === "GEMINI" ? await runtime.actions.draftRoadmap(id) : path === "STARTER" ? await runtime.actions.buildStarter(id) : path === "TOPICS" ? await runtime.actions.writeTopics(id) : path === "BREAKDOWN" ? await runtime.actions.breakDown(id) : await runtime.actions.startManual(id);
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

  // ── UI motion (R7): what stays on screen, and what folds into the (i)s and the card Keys (D13) ──
  const formLead = `Say what you want to be able to do. ${geminiLive ? "Gemini can arrange the milestones; the app" : "The app"} sets every date, level and target from your records, and measures progress from them.`;
  const gap = field ? depthGapDays(depth, m) : null;
  const hoursNum = Number(d.hours);
  const hoursOk = d.hours.trim() !== "" && Number.isInteger(hoursNum) && hoursNum >= HOURS_MIN && hoursNum <= HOURS_MAX;
  // "≈ 9 h 10 seen · 5 h/wk yours · 96 cards · 29 at L6+" (D26: each figure has its spoken twin; D27: ≈ beside the estimate, the pen beside the user's own figure).
  const stats: GlyphStatProps[] = [
    ...(tracked?.kind === "measured" ? [{ glyph: "ev.estimate" as const, value: hoursLabel(tracked.median, false), label: SHORT_SEEN, estimate: true, speech: `about ${hoursSpeech(tracked.median)} seen` }] : []),
    ...(hoursOk ? [{ glyph: "pv.you" as const, value: hoursNum, unit: "h/wk", label: SHORT_YOURS }] : []),
    ...(field && sums
      ? [
          { glyph: "s-know" as const, value: field.cards, unit: field.cards === 1 ? "card" : "cards" },
          { glyph: "stage.familiar" as const, value: sums.atSix, label: "at L6+", speech: `${sums.atSix} at level 6 or higher` },
        ]
      : []),
  ];
  const validSpan = Number.isFinite(span) && span > 0;
  const tooSoon = fieldArea && !realistic && validSpan && span < floorBase(depth, m);
  const dateKeyLine = fieldArea ? (realistic || !validSpan ? null : chosenDateHint(d.targetDay, view.today, depth, m)) : validSpan ? `${dayWithWeekday(d.targetDay, view.today)} · ${count(span)} days from today` : null;
  const whenMonths = fieldArea ? ([6, 12, 24, 36] as const) : ([3, 6, 12, 24, 36] as const);
  const constraintsHint =
    gatedTrack === "CRAFT"
      ? "If your words name a limit or a strain, the app asks which activities to avoid before it places them."
      : gatedTrack
        ? "On a body or care plan the app asks which activities to avoid before it places them."
        : "The app ticks the practice types your constraints seem to rule out, quoting your words; nothing is left out until you say so.";
  // Gemini's lane lists only what the run will ask (geminiAsksOf), in the draft header's order: Domains, order, picks (D25).
  const laneItems = asks ? [...(asks.needs ? [GEMINI_LANE_ITEM.needs] : []), ...(asks.lines > 0 ? [GEMINI_LANE_ITEM.order] : []), ...(asks.picks ? [GEMINI_LANE_ITEM.picks] : [])] : [];

  return (
    <div className="rm-narrow" data-fx="none" data-wc-block="intake">
      {view.draft && (
        <section className="card rm-note" style={{ marginBottom: 14 }} data-wc-fold="">
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
        <section className="card rm-note" style={{ marginBottom: 14 }} data-wc-fold="">
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
        <section className="card rm-note" style={{ marginBottom: 14 }} data-wc-fold="">
          <RoadmapGlyph name="info" />
          <span style={{ flex: 1 }}>{handoffNote(handoff.source, handoff.aim, handoffCarriedOf(handoff, view.fields))}</span>
        </section>
      )}
      {restored && !view.draft && !handoff && (
        <section className="card rm-note" style={{ marginBottom: 14 }} data-wc-fold="">
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
          void submit(askGemini ? "GEMINI" : "STARTER");
        }}
      >
        <section className="card rm-fs" aria-label="The aim">
          <div className="rm-f" id="rm-f-aim" data-wc-fold="">
            <div className="rm-in-hd">
              <label className="st-label" htmlFor={ids.aim}>
                {SHORT_AIM_LABEL}
              </label>
              <span className="rm-in-cnt">
                <Glyph name="m.verbatim" size={16} inherit />
                <Fig compact={`${d.aim.length}/${AIM_MAX}`} />
              </span>
              <InfoTip topic="setting an aim">{formLead}</InfoTip>
            </div>
            <textarea id={ids.aim} className="st-input" rows={2} maxLength={AIM_MAX} value={d.aim} placeholder={AIM_CALL_PLACEHOLDER} aria-describedby={keyIds.aim} onChange={(e) => set("aim", e.target.value)} />
            {vague && <p className="t-meta rm-ink1 rm-vague">{VAGUE_AIM_LINE}</p>}
            {problem("aim")}
          </div>
          <div className="rm-f" id="rm-f-area" data-wc-fold="">
            <button type="button" className="rm-pick" aria-haspopup="dialog" aria-describedby={keyIds.area} onClick={() => setAreaOpen(true)}>
              {trackArea && d.areaTrack ? <Sigil track={TRACK_SIGIL[d.areaTrack]} /> : <Sigil track="know" />}
              <span className="rm-pick-t">
                <span className="sr-only">Area — what this grows: </span>
                {field ? (
                  <b>
                    <span data-wc="name">{field.name}</span> · L{field.level}
                  </b>
                ) : trackArea && d.areaTrack ? (
                  <b>
                    <span data-wc="name">{TRACK_WORD[d.areaTrack]}</span> · practice only
                  </b>
                ) : (
                  <b>{SHORT_PICK_AREA}</b>
                )}
              </span>
              <Icon name="chev" />
            </button>
            {problem("area")}
          </div>
          {field && (
            <div className="rm-f" id="rm-f-depth" data-wc-fold="">
              <div className="rm-in-hd">
                <span className="st-label" id={keyIds.depthLabel}>
                  Depth
                </span>
                <InfoTip topic="depth" describes={keyIds.depthGroup}>
                  <KeyLine>{depthHint(depth, m)}</KeyLine>
                  <KeyLine>{realisticHint(m)}</KeyLine>
                  {exam && <KeyLine>{EXAM_WAYPOINT_HINT}</KeyLine>}
                </InfoTip>
              </div>
              <StageLadder chosen={depth} depth={12} gapDays={gap} />
              <DepthControl id={keyIds.depthGroup} value={depthKey} onChange={(v) => set("depth", v)} />
              {gap != null && (
                <Chips className="rm-in-chips">
                  <HonestyChip kind="review-gap" label={`${SHORT_REVIEW_GAP} ≈ ${gap} d`} sr={`${SHORT_REVIEW_GAP}: about ${gap} days`} />
                </Chips>
              )}
            </div>
          )}
          {field && !emptyLibrary && (
            <div className="rm-f" id="rm-f-domains">
              <span className="st-label">
                Domains{" "}
                {/* Spoken as the count changes ("1 chosen, up to 6"): a chip's move is heard, not only seen. */}
                <span className="rm-opt" aria-live="polite">
                  <Fig compact={`${d.domainIds.length + named.length}/${DEPTH_DOMAINS_MAX}`} speech={`${d.domainIds.length + named.length} chosen, up to ${DEPTH_DOMAINS_MAX}`} />
                </span>
              </span>
              {chosenChips.length > 0 && (
                <div className="rm-dchips" role="group" aria-label="Domains">
                  {field.domains
                    .filter((dm) => d.domainIds.includes(dm.id))
                    .map((dm) => (
                      <button key={dm.id} ref={chipRef(dm.id)} type="button" className="rm-dchip" aria-pressed onClick={() => unchooseChip(dm.id)}>
                        <b data-wc="name">{dm.name}</b>
                        <Fig compact={domainChipCompact(dm)} speech={domainChipCount(dm)} />
                      </button>
                    ))}
                  {d.domainIds
                    .filter((id) => !field.domains.some((dm) => dm.id === id))
                    .map((id) => {
                      const dm = allDomains.get(id);
                      if (!dm) return null;
                      return (
                        <button key={id} ref={chipRef(id)} type="button" className="rm-dchip" aria-pressed onClick={() => unchooseChip(id)}>
                          <b data-wc="name">{dm.name}</b>
                          <span>
                            <span data-wc="name">{dm.fieldName}</span> · <Fig compact={domainChipCompact(dm)} speech={domainChipCount(dm)} />
                          </span>
                        </button>
                      );
                    })}
                </div>
              )}
              {leftOut.length > 0 && (
                <details className="rm-adv rm-in-left" open={leftOpen} onToggle={(e) => setLeftOpen(e.currentTarget.open)}>
                  <summary ref={leftSummary}>
                    <Icon name="chev" />
                    {LEFT_OUT_WORD}
                    <span aria-hidden="true"> · </span>
                    <Fig compact={String(leftOut.length)} speech={plural(leftOut.length, "Domain")} />
                  </summary>
                  <div className="rm-adv-b">
                    <div className="rm-dchips" role="group" aria-label={LEFT_OUT_WORD}>
                      {/* Action buttons, not toggles: a tap adds the Domain to the plan (its chip moves up, focus to the next). */}
                      {leftOut.map((dm) => (
                        <button key={dm.id} ref={chipRef(dm.id)} type="button" className="rm-dchip" onClick={() => chooseLeftOut(dm.id)}>
                          <span className="sr-only">Add </span>
                          <b data-wc="name">{dm.name}</b>
                          <Fig compact={domainChipCompact(dm)} speech={domainChipCount(dm)} />
                        </button>
                      ))}
                    </div>
                  </div>
                </details>
              )}
              <div className="rm-dchips rm-in-other">
                <button ref={otherAdd} type="button" className="rm-dchip rm-dchip-add" onClick={() => setOthersOpen(true)}>
                  <b>+ Domain from another Field</b>
                </button>
              </div>
              {problem("domains")}
            </div>
          )}
          {field && (
            <NamedAreas
              names={named}
              onChange={(n) => set("newDomainNames", n)}
              chosen={d.domainIds}
              describedBy={emptyLibrary ? keyIds.named : undefined}
              library={field.domains}
              onPick={chooseDomain}
              problem={emptyLibrary ? problem("domains") : null}
            />
          )}
          {field && (coverage.length > 0 || problems.coverage) && (
            <div className="rm-f">
              <CoverageDisclosure
                rows={coverage}
                typed={d.coverage ?? {}}
                onType={(id, v) => edit((x) => ({ ...x, coverage: { ...(x.coverage ?? {}), [id]: v } }))}
                unassigned={unassigned}
                overMax={d.domainIds.length + named.length >= DEPTH_DOMAINS_MAX}
              />
              {problem("coverage")}
            </div>
          )}
          <FormKey entries={[{ glyph: "m.verbatim", words: GLYPH_MEANS["m.verbatim"] }]} rows={field && !emptyLibrary ? field.domains.map((dm) => `${dm.name}: ${domainChipCount(dm)}`) : undefined}>
            <KeyLine id={keyIds.aim}>What do you want to be able to do? {AIM_LONG_HINT} Shown exactly as you wrote it, everywhere. Never rewritten.</KeyLine>
            <KeyLine id={keyIds.area}>
              {`One of your Fields, or a life track for an aim that is practice only. Only you pick the Area.${field?.inMaintenance ? " This Field is excused from quotas and Boss." : ""}`}
            </KeyLine>
            {trackArea && d.areaTrack && <KeyLine>{`Practices count toward ${TRACK_WORD[d.areaTrack]} — fixed by the Area. The plan has practices and steps only; there are no cards to hold.`}</KeyLine>}
            {field && !emptyLibrary && <KeyLine>{`${DOMAINS_PREFILL_LINE} Counts are your cards today; the plan counts every card type but multiple choice.`}</KeyLine>}
            {emptyLibrary && <KeyLine id={keyIds.named}>{NAME_AREAS_HINT}</KeyLine>}
          </FormKey>
        </section>

        <section className="card rm-fs" aria-label="Time and pace">
          <div className="rm-f" id="rm-f-targetDay" data-wc-fold={fieldArea ? undefined : ""}>
            <label className="st-label" htmlFor={ids.date}>
              By when
            </label>
            <div className="rm-chips rm-date-chips">
              {fieldArea && (
                <ChipButton pressed={realistic} onClick={() => set("dateMode", "REALISTIC")}>
                  {WHEN_REALISTIC}
                </ChipButton>
              )}
              {whenMonths.map((mo) => {
                const day = fieldArea ? chipDay(mo as 6 | 12 | 24 | 36) : mo === 36 ? addDays(view.today, SPAN_MAX_DAYS) : addMonths(view.today, mo);
                return <WhenChip key={mo} months={mo} pressed={!realistic && d.targetDay === day} onPick={() => pickDate(day)} possible={fieldArea ? chipPossible(mo as 6 | 12 | 24 | 36) : null} depth={depth} />;
              })}
            </div>
            {/* "When realistic" sets no date of the user's: the box stays empty until one is picked (pickDate switches to CHOSEN). */}
            <input
              id={ids.date}
              type="date"
              className="st-input"
              aria-label="A date of your own"
              aria-describedby={dateKeyLine ? keyIds.date : undefined}
              value={realistic ? "" : d.targetDay}
              min={addDays(view.today, SPAN_MIN_DAYS)}
              max={addDays(view.today, SPAN_MAX_DAYS)}
              onChange={(e) => pickDate(e.target.value)}
            />
            {!realistic &&
              (validSpan ? (
                <p className="st-hint rm-in-date" aria-hidden="true">
                  <Glyph name="t.cal" size={12} inherit />
                  {fieldArea ? dayFull(d.targetDay) : dayWithWeekday(d.targetDay, view.today)}
                  {tooSoon && (
                    <span className="chip rm-in-vd">
                      <Glyph name="v.imp" size={12} inherit />
                      {shortTooSoon(depth)}
                    </span>
                  )}
                </p>
              ) : (
                <p className="st-hint">Pick a date</p>
              ))}
            {problem("targetDay")}
          </div>
          <div className="rm-f" id="rm-f-hours">
            <span className="st-label">Hours a week</span>
            <div className="rm-step">
              <GlyphButton glyph="minus" label="One hour less" onClick={() => set("hours", String(Math.max(HOURS_MIN, (Number(d.hours) || HOURS_MIN) - 1)))} />
              <input id={ids.hours} className="st-input" inputMode="numeric" aria-label="Hours a week" aria-describedby={keyIds.hours} value={d.hours} onChange={(e) => set("hours", e.target.value.replace(/[^\d]/g, ""))} />
              <button type="button" className="icon-btn" aria-label="One hour more" onClick={() => set("hours", String(Math.min(HOURS_MAX, (Number(d.hours) || 0) + 1)))}>
                <Icon name="plus" />
              </button>
            </div>
            {stats.length > 0 && (
              <div className="rm-in-stats">
                <StatRow items={stats} />
                {tracked?.kind === "measured" && <HonestyChip kind="not-timed" label={SHORT_NOT_TIMED} />}
              </div>
            )}
            {tracked?.kind === "calibrating" && <p className="t-meta rm-in-cal">{trackedLine}</p>}
            {problem("hours")}
          </div>
          {trackArea && (
            <div className="rm-f">
              <span className="st-label">Where you&apos;re starting</span>
              <Segmented className="rm-seg-fill rm-seg-2" value={d.startPoint} label="Where you're starting" onChange={(v) => set("startPoint", v)} options={START_POINTS.map((p) => ({ value: p, label: START_POINT_WORD[p] }))} />
            </div>
          )}
          <FormKey
            entries={[...(tracked?.kind === "measured" ? [{ glyph: "ev.estimate" as const, words: `≈ ${GLYPH_MEANS["ev.estimate"]}` }] : []), ...(hoursOk ? [{ glyph: "pv.you" as const, words: GLYPH_MEANS["pv.you"] }] : [])]}
            rows={fieldArea ? whenMonths.map((mo) => `${whenChipLabel(mo).spoken}: ${chipVerdict(chipPossible(mo as 6 | 12 | 24 | 36), depth)}`) : undefined}
          >
            {dateKeyLine && <KeyLine id={keyIds.date}>{dateKeyLine}</KeyLine>}
            {trackArea && splitLine && <KeyLine>{splitLine}</KeyLine>}
            <KeyLine id={keyIds.hours}>{`Hours a week for this aim: ${HOURS_MIN} to ${HOURS_MAX}.${trackedLine ? ` ${trackedLine}` : ""}`}</KeyLine>
            {field && sums && (
              <KeyLine>{`Your cards, from the app. ${field.name}: ${plural(field.cards, "card")}, ${sums.atSix} at level 6+, ${sums.atTop} at level 12 or more. Your cards say where you start: a stage you already hold shows as held.`}</KeyLine>
            )}
          </FormKey>
        </section>

        <section className="card rm-fs" aria-label="Facts only you can give">
          {fieldArea && (
            <details className="rm-adv rm-adv-first" id="rm-f-exam" open={examOpen || Boolean(problems.exam)} onToggle={(e) => setExamOpen(e.currentTarget.open)}>
              <summary>
                <Icon name="chev" />
                <SummaryGlyph name="quest.checkpoint" />
                {exam && d.exam.trim() ? (
                  <span>
                    Exam · <span data-wc="own">{d.exam.trim()}</span>
                  </span>
                ) : (
                  SHORT_EXAM_OPTIONAL
                )}
              </summary>
              <div className="rm-adv-b">
                <div className="rm-f">
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
                </div>
                {exam && (
                  <div className="rm-f">
                    <label className="st-label" htmlFor={ids.exam}>
                      {EXAM_NAME_LABEL}
                    </label>
                    <input id={ids.exam} className="st-input" maxLength={EXAM_MAX} value={d.exam} onChange={(e) => set("exam", e.target.value)} />
                    <label className="st-label" htmlFor={ids.examDay} style={{ marginTop: 10 }}>
                      {EXAM_DATE_LABEL}
                    </label>
                    <input id={ids.examDay} type="date" className="st-input" value={d.examDay ?? ""} min={addDays(view.today, 1)} max={addDays(view.today, SPAN_MAX_DAYS)} onChange={(e) => set("examDay", e.target.value)} />
                    {geminiLive && <p className="st-hint">It is never sent to Gemini.</p>}
                  </div>
                )}
                {problem("exam")}
              </div>
            </details>
          )}
          {fieldArea && d.practicesAllowed && (
            <div className="rm-f" id="rm-f-family">
              <span className="st-label">{FAMILY_QUESTION}</span>
              <Segmented
                className="rm-seg-fill rm-seg-2"
                value={family}
                label={FAMILY_QUESTION}
                onChange={(v) => set("practiceFamily", v)}
                options={PRACTICE_FAMILIES.map((f) => ({ value: f, label: FAMILY_WORD[f] }))}
              />
            </div>
          )}
          <details className={fieldArea ? "rm-adv" : "rm-adv rm-adv-first"} id="syllabus" open={outlineOpen || Boolean(d.syllabus) || Boolean(problems.syllabus) || (fieldArea && exam)}>
            <summary>
              <Icon name="chev" />
              <SummaryGlyph name="pv.syllabus" />
              {lines.length ? `Syllabus · ${plural(lines.length, "line")}` : SHORT_SYLLABUS_OPTIONAL}
            </summary>
            <div className="rm-adv-b" id="rm-f-syllabus">
              <p className="st-hint" style={{ margin: 0 }}>
                {fieldArea ? outlineLabel : "Paste the topic list from the official source. The plan's topics then come from your list."}
              </p>
              <textarea id={ids.syllabus} className="st-input" rows={3} placeholder={`One topic per line · up to ${SYLLABUS_MAX_LINES} lines`} aria-label="Outline lines" value={d.syllabus} onChange={(e) => set("syllabus", e.target.value)} />
              <input id={ids.sylSource} className="st-input" maxLength={SOURCE_NOTE_MAX} placeholder="Source" aria-label="Outline source" value={d.syllabusSource} onChange={(e) => set("syllabusSource", e.target.value)} />
              {fieldArea && lines.length > 0 && chosen.length > 0 && (
                <LineDomainGroups lines={lines} domains={lineDomains} chosen={chosen} onChange={(line, id) => edit((x) => ({ ...x, lineDomainBy: { ...(x.lineDomainBy ?? {}), [line]: id } }))} />
              )}
              {problem("syllabus")}
            </div>
          </details>
          {!fieldArea && (
            <details className="rm-adv" id="rm-f-exam" open={Boolean(problems.exam)}>
              <summary>
                <Icon name="chev" />
                <SummaryGlyph name="quest.checkpoint" />
                {d.exam.trim() ? (
                  <span>
                    Exam · <span data-wc="own">{d.exam.trim()}</span>
                  </span>
                ) : (
                  SHORT_EXAM_OPTIONAL
                )}
              </summary>
              <div className="rm-adv-b">
                <div className="rm-f">
                  <label className="st-label" htmlFor={ids.exam}>
                    Exam or certificate <span className="rm-opt">optional</span>
                  </label>
                  <input id={ids.exam} className="st-input" maxLength={EXAM_MAX} placeholder="Leave blank if there isn't one" value={d.exam} onChange={(e) => set("exam", e.target.value)} />
                  {problem("exam")}
                </div>
              </div>
            </details>
          )}
          <div className="rm-f">
            <span className="st-label" id={keyIds.hardLabel}>
              How hard
            </span>
            <HardControl value={d.intensity} onChange={(v) => set("intensity", v)} labelledBy={keyIds.hardLabel} describedBy={keyIds.hard} />
          </div>
          {askCards && (
            <div className="rm-f" id="rm-f-newCards">
              <label className="st-label" htmlFor={ids.newCards}>
                New cards a week{" "}
                <span className="rm-opt">
                  {newCardsRequired ? "needed" : "optional"} · {NEW_CARDS_PER_WEEK_MIN} to {NEW_CARDS_PER_WEEK_MAX}
                </span>
              </label>
              <input
                id={ids.newCards}
                className="st-input rm-num"
                inputMode="numeric"
                placeholder="e.g. 4"
                aria-describedby={newCardsRequired ? undefined : keyIds.newCards}
                value={d.newCards}
                onChange={(e) => set("newCards", e.target.value.replace(/[^\d]/g, ""))}
              />
              {newCardsRequired && <p className="st-hint">{NEW_CARDS_REQUIRED_HINT}</p>}
              {problem("newCards")}
            </div>
          )}
          <details className="rm-adv" id="reality" open={Boolean(d.typicalHours) || Boolean(problems.typicalHours)}>
            <summary>
              <Icon name="chev" />
              Reality check<span className="rm-adv-aside">{d.typicalHours ? `optional · ${d.typicalHours} h` : "optional"}</span>
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
            <div className="rm-in-hd">
              <label className="st-label" htmlFor={ids.constraints}>
                {SHORT_ANYTHING_TO_AVOID}
              </label>
              <span className="rm-count">
                <Fig compact={`${d.constraints.length}/${CONSTRAINTS_MAX}`} />
              </span>
            </div>
            <textarea id={ids.constraints} className="st-input" rows={2} maxLength={CONSTRAINTS_MAX} value={d.constraints} aria-describedby={keyIds.constraints} onChange={(e) => set("constraints", e.target.value)} />
            {problem("constraints")}
          </div>
          {activity && <IntakeActivities view={activity.view} keyNow={activity.key} confirmed={activityAnswer} onConfirm={setActivityAnswer} today={view.today} />}
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
              {field && (
                <div className="rm-f">
                  <span className="st-label">Practices count toward</span>
                  <Segmented className="rm-seg-fill" value={d.track} label="Practices count toward" onChange={(t) => set("track", t)} options={ROADMAP_TRACKS.map((t) => ({ value: t, label: TRACK_WORD[t] }))} />
                  <p className="st-hint">The life track the practices you start will feed on Today.</p>
                </div>
              )}
              {fieldArea && gapsLive && geminiLive && (
                <div className="rm-sw">
                  <span className="rm-sw-t">{SUGGEST_AREAS_LABEL}</span>
                  <Switch checked={d.suggestAreas === true} onChange={(v) => set("suggestAreas", v)} label={SUGGEST_AREAS_LABEL} />
                </div>
              )}
              {/* While the Gemini path is on a free-tier key, both lines are the «Google may use this» chip's, beside the buttons. */}
              {geminiLive && !(askGemini && view.keyTier === "FREE") && (
                <p className="st-hint" style={{ margin: 0 }}>
                  {privacyLine(PACK_SECTIONS)}
                </p>
              )}
              {geminiLive && !askGemini && view.keyTier === "FREE" && (
                <p className="st-hint" style={{ margin: 0 }}>
                  {FREE_TIER_LINE}
                </p>
              )}
            </div>
          </details>
          <FormKey
            entries={[
              { glyph: "quest.checkpoint", words: EXAM_NAME_LABEL },
              { glyph: "pv.syllabus", words: GLYPH_MEANS["pv.syllabus"] },
            ]}
          >
            <KeyLine id={keyIds.hard}>{fieldArea ? paceShareHint(d.intensity) : intensityHint()}</KeyLine>
            {fieldArea && d.practicesAllowed && <KeyLine>{`${FAMILY_HINT[family]}${d.practiceFamily == null ? ` ${FAMILY_PREFILL_HINT}` : ""}`}</KeyLine>}
            {fieldArea && lines.length > 0 && chosen.length > 0 && <KeyLine>Each line&apos;s Domain is yours: the app matched the names, and it sets how many cards each Domain needs.</KeyLine>}
            {askCards && !newCardsRequired && <KeyLine id={keyIds.newCards}>How many new cards a week will you write for this? Leave it blank and new cards won&apos;t be counted until your pace is measured.</KeyLine>}
            <KeyLine id={keyIds.constraints}>{constraintsHint}</KeyLine>
          </FormKey>
        </section>

        {/* Who does what on each path (D25): the lanes, with what Gemini will do one tap away. */}
        {askGemini && (
          <div className="rm-in-lanes">
            <GlyphLane who="gemini" items={laneItems} />
            <GlyphLane who="app" items={APP_LANE_ITEMS} />
            <InfoTip topic="drafting with Gemini">{geminiArrangesLine(asks)}</InfoTip>
          </div>
        )}
        {geminiLive && !askGemini && (
          <div className="rm-in-lanes">
            <GlyphLane who="app" items={APP_LANE_ITEMS} />
            {/* Nothing for Gemini to decide (contracts §20.5: the schema would have no property): only the app's build, and why. */}
            <InfoTip topic="building from your numbers">{GEMINI_NOTHING_TO_ASK_LINE}</InfoTip>
          </div>
        )}

        <div className="rm-sticky" data-kb={inset > 0 ? "1" : undefined} style={inset > 0 ? ({ ["--kb" as string]: `${inset}px` } as CSSProperties) : undefined}>
          {askGemini ? (
            <>
              <Button type="submit" variant="primary" size="lg" disabled={busy != null}>
                {busy === "GEMINI" ? "Saving…" : "Draft with Gemini"}
              </Button>
              <Button size="lg" disabled={busy != null} onClick={() => void submit("STARTER")}>
                {busy === "STARTER" ? "Building…" : "Build from my numbers"}
              </Button>
              {view.keyTier === "FREE" && (
                <Chips className="rm-in-path">
                  <HonestyChip
                    kind="data"
                    label={SHORT_DATA}
                    full={
                      <>
                        {privacyLine(PACK_SECTIONS)} {FREE_TIER_LINE}
                      </>
                    }
                  />
                </Chips>
              )}
            </>
          ) : geminiLive ? (
            <Button type="submit" variant="primary" size="lg" disabled={busy != null}>
              {busy === "STARTER" ? "Building…" : "Build from my numbers"}
            </Button>
          ) : (
            <>
              <Button type="submit" variant="primary" size="lg" disabled={busy != null}>
                {busy === "STARTER" ? "Building…" : "Build from my numbers"}
              </Button>
              <Button size="lg" disabled={busy != null} onClick={() => void submit("MANUAL")}>
                {busy === "MANUAL" ? "Opening…" : "Write it myself"}
              </Button>
              <Chips className="rm-in-path">
                <HonestyChip kind="no-key" label={SHORT_NO_KEY} full={NO_KEY_LINE} />
              </Chips>
            </>
          )}
          {topicsLive && field && (
            // Revision 5, lane 9: the topic paths for a Field Area (2–4 words each); the level plan stays the primary path above.
            <div className="rm-in-topics" role="group" aria-label={TOPIC_PATHS_LABEL}>
              {breakDownLive && (
                <Button size="lg" disabled={busy != null} onClick={() => void submit("BREAKDOWN")}>
                  {busy === "BREAKDOWN" ? "Saving…" : BREAK_IT_DOWN_WORD}
                </Button>
              )}
              <Button size="lg" disabled={busy != null} onClick={() => void submit("TOPICS")}>
                {busy === "TOPICS" ? "Opening…" : WRITE_TOPICS_WORD}
              </Button>
              <InfoTip topic={WRITE_TOPICS_WORD.toLowerCase()}>{WRITE_TOPICS_LINE}</InfoTip>
            </div>
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
