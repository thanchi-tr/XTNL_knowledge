/**
 * The roadmap's UI copy (lane R5; roadmap.md rev 3, F2, F6, F9, F12, F13,
 * F17–F19, Names). Every string the roadmap surfaces show lives here or in
 * the view builders (roadmap-ui-model.ts), and roadmap-ui-check pins each
 * naming rule against them:
 *   - "week quest(s)", never a bare "quest"; no heading starts with "Quest";
 *     every count carries its unit ("3 of 8 cards");
 *   - "Proficiency" always with its % and its parts;
 *   - a rank name only under "Aim rank", in "Aim ranks on this plan", or in a
 *     line naming what gives it; no "earn" in a rank line;
 *   - levels with the current interval multiplier; "Mastered" for level 12 only;
 *   - MP only through statedPayoutCopy and the ⬡ glyph; no href to /review.
 *
 * Pure and client-importable. Lib modules never import this file (their basis
 * lines are their own). Contract: docs/life-plan/roadmap-contracts.md §R5.
 *
 *   METHOD_HOW · topicHow · PROVENANCE_WORDS · WEEK_QUEST_CAPTIONS · TIME_FIXED_LINE
 *   AIM_UNCHECKED_LINE · CREDENTIAL_LINE · HEALTH_LINE · CONSTRAINTS_LINE · NO_KEY_LINE
 *   FREE_TIER_LINE · DRAFT_CAP_LINE · RUN_STARTER_LINE · WRITES_OFF_BANNER · privacyLine
 *   levelPhrase · verdictWord · whyTitle · basisClassNote · labelWithClass · flagReasonLine
 *   ACTIVITY_QUESTION · activityLeadLine · activityPendingLine · activityRowLine · activitySummaryLines ·
 *   activityStaleLine · activitySaveLine · activitySuggestedLine · activityPausedLine · aimConflictLine
 *   (confirm to unlock, contracts §19)
 *   geminiV4LeadLine · GEMINI_V4_LEAD_LINE · arrangementV4Line · ARRANGEMENT_V4_LINE · geminiArrangesLine ·
 *   GEMINI_NOTHING_TO_ASK_LINE · GEMINI_CHOICE_WORDS · choicesWaitingLine · keepChoicesWord · appDefaultsWord ·
 *   CHOICES_PLAN_LEVEL · KEEP_MY_ORDER_WORD · APP_PRACTICE_WORD · PRACTICE_TURN_LINE · geminiChoiceLine · STAGE_WHY_WORD · StageEnd ·
 *   STAGE_END_WORD · stageWhyPartsOf · stageWhyLine (the practice progression, contracts §20)
 *   + the formatting, flag, rank, Proficiency, pace and pay lines below.
 */
import { LIFE_TZ, addDays, dayKeyOf, daysBetween, type DayKey } from "@/lib/life-day";
import { goalPercent, statedPayoutCopy } from "@/lib/goals";
import type { Track } from "@/lib/life-types";
import {
  AIM_RANKS,
  CARDS_PER_OUTLINE_LINE,
  COVER_FLOOR_CARDS,
  COVER_SHARE,
  DEPTH_DOMAINS_MAX,
  INTENSITY,
  NOT_RECORDED_HERE,
  PARAGON_MIN_MILESTONES,
  ROADMAP_DRAFTS_PER_DAY,
  ROADMAP_WRITES_OFF,
  STAGE_LEVEL,
  STAGE_NAMES,
  TRACK_PARAGON_MIN_DAYS,
  floorBase,
  gapsNotShownOf,
  interval,
  stageLabelOf,
  stageOfLevel,
  type ActivityRow,
  type AimCheck,
  type AimDepth,
  type AimLineView,
  type ConstraintExclusion,
  type CoverageBreakdown,
  type CoverageChoice,
  type DateVerdict,
  type DepthChoice,
  type DomainAddition,
  type DomainOrigin,
  type GroundSourceKind,
  type LastAimView,
  type ParagonMissing,
  type SessionPicks,
  type StageKey,
  type ValidationIntegrity,
  type AimRankView,
  type BlockingFlag,
  type CheckpointKind,
  type ComputedClass,
  type Intensity,
  type ItemNote,
  type KnowledgeVerdict,
  type MilestoneFeasibility,
  type MilestoneNote,
  type MilestoneRowState,
  type NextRank,
  type PackSection,
  type PaceResult,
  type PracticeFamily,
  type PracticeMethod,
  type PracticePace,
  type ProficiencyChange,
  type ProficiencyView,
  type ProvenanceClass,
  type StartPoint,
  type StatedZeroReason,
  type TextClass,
  type TimeVerdict,
  type WeekQuestKind,
  type WeekQuestUnit,
} from "@/lib/roadmap-types";
import { ACTIVITY_CARD_NAME, ACTIVITY_NOTHING_TO_AVOID, CATALOG, catalogHowOf, type CatalogKey, type CatalogTrack } from "@/lib/roadmap-catalog";
import { AIM_LATER_DAYS } from "@/lib/roadmap-invite";

// ═══ The contract's copy ═════════════════════════════════════════════════════

/**
 * 3–5 lines of plain procedure per method: no digits, no efficacy words and no
 * CLAIM_WORDS (roadmap-ui-check). Code writes these; the model never does.
 */
export const METHOD_HOW: Readonly<Record<PracticeMethod, readonly string[]>> = {
  DELIBERATE_PRACTICE: [
    "Pick a narrow point you get wrong.",
    "Work on only that point for the whole session.",
    "Check each attempt against a correct answer straight away.",
    "Note what went wrong before the next attempt.",
  ],
  READING: [
    "Choose one section of the material before you start.",
    "Read it through once without stopping.",
    "Close it and write down what you can recall.",
    "Turn what you could not recall into cards in its Domain.",
  ],
  PROJECT_WORK: [
    "Decide which piece you will build this session.",
    "Work on it until the session ends, even if it is unfinished.",
    "Write a line on where you stopped and what comes next.",
    "Turn anything you had to look up into a card.",
  ],
  COACHED_SESSION: [
    "Bring one question or piece of work to the session.",
    "Ask your teacher or partner to watch you do it.",
    "Write down each correction they give.",
    "Practise those corrections before the next session.",
  ],
  WORKOUT: [
    "Warm up gently before the main part.",
    "Do the session as you planned it, at an effort you can hold.",
    "Stop if something hurts in a way that is not ordinary effort.",
    "Write a line on how it went.",
  ],
  WRITING: [
    "Pick one piece to write this session.",
    "Write without editing until the session is half over.",
    "Use the rest of the session to revise it.",
    "Keep each finished draft so you can compare them later.",
  ],
};

/** A topic's one fixed "how". */
export function topicHow(domain: string): string {
  return `Write cards on it in ${domain} and review them when due.`;
}

/** Each class's words wherever it is shown. DRAFT and KEPT_SUGGESTION always carry theirs: never colour alone. */
export const PROVENANCE_WORDS: Readonly<Record<ProvenanceClass, string>> = {
  MEASURED: "tested by your reviews",
  RECORDED: "counted by the app; it doesn't judge them",
  SELF_REPORTED: "from your ticks",
  ESTIMATED: "task estimates, not timed",
  WORKED_OUT: "worked out by the app",
  YOURS: "yours",
  KEPT_SUGGESTION: "Gemini's words · kept by you · not checked",
  DRAFT: "Gemini suggestion · not checked",
};

/** Each week quest kind's evidence caption, in words (F14, F17). */
export const WEEK_QUEST_CAPTIONS: Readonly<Record<WeekQuestKind, string>> = {
  RAISE: "tested by your reviews",
  ADD: "counted by the app; it doesn't judge them",
  PRACTICE: "from your ticks",
  STEP: "you tick it",
  CHECKPOINT: "you log it · doesn't move your progress",
};

/** Every time verdict's fixed line (decision 6). */
export const TIME_FIXED_LINE = "Counts only what the app tracks: reviews, new cards and the practices below. Time to study the material elsewhere isn't estimated.";
/** The aim check without the user's figure (never a chip beside the aim). */
export const AIM_UNCHECKED_LINE = "Aim not checked: the app doesn't know how long this usually takes";
/** Credential aims with no syllabus (decision 2). */
export const CREDENTIAL_LINE = "The topics below are Gemini's guess, not the official syllabus.";
/** The fixed line beside every HEALTH flag and Body practice. */
export const HEALTH_LINE = "Not medical advice — check health-related changes with a professional.";
/** For a draft with constraints. */
export const CONSTRAINTS_LINE = "Constraints are shown to Gemini; the app doesn't check them.";
/** The no-key path's line (there is never a disabled Draft button). */
export const NO_KEY_LINE = "The app builds this plan from your own numbers — the checks and measures all run.";
/** Only with a key and GEMINI_KEY_TIER 'FREE' (equals roadmap-model's FREE_TIER_NOTE; roadmap-ui-check pins it). */
export const FREE_TIER_LINE = "This server's Gemini key is on Google's free tier, so Google may use what drafting sends to improve its products.";
/** The draft cap's one line (equals roadmap-model's DRAFT_CAP_LINE; roadmap-ui-check pins it). It claims nothing about the rows on screen. */
export const DRAFT_CAP_LINE = `${ROADMAP_DRAFTS_PER_DAY} drafts today — build from your numbers or write it yourself.`;
/** A FAILED Gemini run that wrote R2's starter in its place (F8 "On failure"). */
export const RUN_STARTER_LINE = "Gemini didn't answer; here is a plan from your numbers. Every check still runs.";
/** A reply the tripwire refused (runDraftCore's "reply refused: …"): Gemini did answer, so never "didn't answer". */
export const RUN_REFUSED_LINE = "Gemini's reply held words the app didn't write, so none of it is used. Here is a plan from your numbers; every check still runs.";
/** The latest run failed and wrote nothing: the rows on screen are the earlier draft's, unchanged. */
export const RUN_UNFINISHED_LINE = "The last draft didn't finish, so nothing below changed.";
/** The draft header's lead line by who wrote the rows (F9): Gemini's words, or code's. */
export const GEMINI_LEAD_LINE = "Gemini suggested the words. Every number here is worked out by the app from your records or typed by you.";
export const BUILT_LEAD_LINE = "Built from your numbers.";
/** An ACTIVE roadmap's pending re-plan (version + 1), shown above Now. */
export const REPLAN_EYEBROW = "Re-plan draft · not accepted yet";
/**
 * A re-plan's lead line by who wrote its rows (the contract §11.2): the app
 * re-fitted the accepted plan (INHOUSE), or the user edited it (MANUAL). The
 * words carried from the accepted plan keep their class, so while any row is
 * still Gemini's (DRAFT or KEPT_SUGGESTION) the line adds REPLAN_GEMINI_LINE.
 */
export const REPLAN_REFIT_LINE = "Re-fitted from your accepted plan.";
export const REPLAN_EDITED_LINE = "Edited from your accepted plan.";
export const REPLAN_GEMINI_LINE = "Gemini's words stay marked.";
/** The Reference's run label when the view doesn't name the run behind the accepted plan (RoadmapView.acceptedRun undefined). */
export const LATEST_RUN_LABEL = "Latest run";
/** The run behind the plan on screen (RunTable's key). */
export const DRAFTED_BY_LABEL = "Drafted by";
/** The writes-off banner (the contract §9.3): the figures are the stored readings, the live app's own. */
export const WRITES_OFF_BANNER = `This server records nothing: readings here are the live app's own. ${ROADMAP_WRITES_OFF}.`;
/** The Create sheet's similarity box when the user's Domains were not loaded here (never "none is similar"). */
export const LIBRARY_UNCHECKED_LINE = "Your Domains weren't checked here.";
/** A plan-only edit of Gemini's words (sessions, band, bar, kind): the numbers become yours, the words don't. */
export const EDIT_NUMBERS_NOTE = "Your numbers; the words stay Gemini's until you edit them or tap I checked this.";

/**
 * How each pack section is named in the privacy line (closed: every
 * PackSection has words). Revision 4 (F-R4-17): the v3 pack sends the
 * outline lines with the Domain each is tied to, the plan's stages (whether
 * there is an exam, never its date) and which Domains you chose.
 */
export const PACK_SECTION_WORDS: Readonly<Record<PackSection, string>> = {
  aim: "your aim",
  area: "Area name",
  constraints: "constraints",
  exam: "exam name",
  syllabus: "outline lines with the Domain you tied each to",
  plan: "the plan's stages and whether there is an exam (never its date)",
  domains: "your Domain names with their card counts and which Domains you chose",
};
const PACK_SECTION_ORDER: readonly PackSection[] = ["aim", "area", "constraints", "exam", "syllabus", "plan", "domains"];

/** "A, B and C" / "A, B, and C" helpers. */
function listWords(parts: readonly string[], last = "and"): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} ${last} ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, ${last} ${parts[parts.length - 1]}`;
}

/** The privacy line, generated from the pack builder's section list, so it cannot drift from what is sent. */
export function privacyLine(sections: readonly PackSection[]): string {
  const present = PACK_SECTION_ORDER.filter((s) => sections.includes(s)).map((s) => PACK_SECTION_WORDS[s]);
  return `Drafting sends Google ${listWords(present)} — never your cards, their titles or ids.`;
}

/** The gap a card at level L came through: interval(L − 1) at the current multiplier. */
export function levelGapDays(level: number, m: number): number {
  return Math.max(1, interval(Math.max(1, level - 1), m));
}

/** "each recalled after a gap of about 12 days" (the current multiplier). */
export function levelGapPhrase(level: number, m: number): string {
  const d = levelGapDays(level, m);
  return `each recalled after a gap of about ${d} ${d === 1 ? "day" : "days"}`;
}

/** "cards at level 6+ (each recalled after a gap of about 12 days)". */
export function levelPhrase(level: number, m: number): string {
  return `cards at level ${level}+ (${levelGapPhrase(level, m)})`;
}

const VERDICT_WORD: Readonly<Record<KnowledgeVerdict | TimeVerdict, string>> = {
  FITTED: "Fitted",
  FITS: "Fits",
  TIGHT: "Tight",
  OVER: "Over",
  IMPOSSIBLE: "Impossible",
};

/** A verdict as a word, never colour alone: "Fitted", "Fits", "Tight", "Over", "Impossible"; "Unverified · Fits". */
export function verdictWord(verdict: KnowledgeVerdict | TimeVerdict, unverified = false): string {
  const w = VERDICT_WORD[verdict];
  return unverified && verdict !== "FITTED" && verdict !== "IMPOSSIBLE" ? `Unverified · ${w}` : w;
}

const KNOWLEDGE_SEVERITY: readonly KnowledgeVerdict[] = ["FITTED", "FITS", "TIGHT", "OVER", "IMPOSSIBLE"];

/** The worst card verdict of a milestone; null when it has no card target (a practice-only milestone). */
export function worstKnowledgeVerdict(ks: readonly { verdict: KnowledgeVerdict }[]): KnowledgeVerdict | null {
  let worst: KnowledgeVerdict | null = null;
  for (const k of ks) if (worst == null || KNOWLEDGE_SEVERITY.indexOf(k.verdict) > KNOWLEDGE_SEVERITY.indexOf(worst)) worst = k.verdict;
  return worst;
}

/** The Why sheet's title: "Why milestone 2 reads Fitted · Fits"; a milestone with no card target names only its time verdict. */
export function whyTitle(title: string, mf: Pick<MilestoneFeasibility, "knowledge" | "time">): string {
  const k = worstKnowledgeVerdict(mf.knowledge);
  return `Why ${title.toLowerCase()} reads ${k ? `${verdictWord(k)} · ` : ""}${verdictWord(mf.time.verdict, mf.time.unverified)}`;
}

// ═══ Dates and times (life days are calendar keys; no clock is read) ═════════

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function partsOf(day: DayKey): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y, m, d];
}

/** "Sun" (life days: Monday is 1). */
export function weekdayName(day: DayKey): string {
  const [y, m, d] = partsOf(day);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAYS[dow === 0 ? 6 : dow - 1];
}

/** "13 Dec", with the year when it differs from `today`'s ("31 Dec 2027"). */
export function dayLabel(day: DayKey, today?: DayKey): string {
  const [y, m, d] = partsOf(day);
  const year = today && today.slice(0, 4) !== day.slice(0, 4) ? ` ${y}` : "";
  return `${d} ${MONTHS[m - 1]}${year}`;
}

/** "Sun 13 Dec" (year as dayLabel). */
export function dayWithWeekday(day: DayKey, today?: DayKey): string {
  return `${weekdayName(day)} ${dayLabel(day, today)}`;
}

/** "Mon 25 – Sun 31 Jan" (a window inside one or two months). */
export function windowLabel(from: DayKey, to: DayKey, today?: DayKey): string {
  const [, fm] = partsOf(from);
  const [, tm] = partsOf(to);
  const start = fm === tm && from.slice(0, 4) === to.slice(0, 4) ? `${weekdayName(from)} ${partsOf(from)[2]}` : dayWithWeekday(from, today);
  return `${start} – ${dayWithWeekday(to, today)}`;
}

/** "Mon 21 Dec → Sun 7 Mar". */
export function spanLabel(from: DayKey | null, to: DayKey | null, today?: DayKey): string {
  if (!from || !to) return "no dates";
  return `${dayWithWeekday(from, today)} → ${dayWithWeekday(to, today)}`;
}

/** "09:12" in the life zone (explicit, so the server and the browser agree). */
export function timeLabel(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: LIFE_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t);
}

/** The calendar date of an instant in the life zone ("2026-10-04"), so a date shown beside timeLabel never comes from the UTC string. */
export function calendarDayOf(iso: string): DayKey | null {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: LIFE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(t);
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "09:12:04" (the RUNNING state's start time). */
export function timeSecondsLabel(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: LIFE_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(t);
}

/** "measured 09:12" today, "measured Sat" within the week, "measured 4 Oct" before. */
export function measuredLabel(iso: string | null, today: DayKey): string {
  if (!iso) return "not measured yet";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "not measured yet";
  const day = dayKeyOf(t);
  if (day === today) return `measured ${timeLabel(iso)}`;
  const ago = daysBetween(day, today);
  if (ago > 0 && ago < 7) return `measured ${weekdayName(day)}`;
  return `measured ${dayLabel(day, today)}`;
}

/** "≈ 4 h 10", "≈ 50 min", "≈ 2 h". */
export function hoursLabel(minutes: number, approx = true): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const body = h === 0 ? `${r} min` : r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, "0")}`;
  return approx ? `≈ ${body}` : body;
}

/** "26 wk left" from today to the aim's date. */
export function weeksLeftLabel(today: DayKey, targetDay: DayKey): string {
  const w = Math.max(0, Math.round(daysBetween(today, targetDay) / 7));
  return `${w} wk left`;
}

/** The DayKey a calendar-month offset lands on (clamped to the month's last day). */
export function addMonths(day: DayKey, months: number): DayKey {
  const [y, m, d] = partsOf(day);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** "1,092" */
export function count(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

/** "1 card" / "3 cards". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

// ═══ Words for closed values ═════════════════════════════════════════════════

export const TRACK_WORD: Readonly<Record<Track, string>> = { CRAFT: "Craft", BODY: "Body", CARE: "Care", DUTY: "Duty" };
export const TRACK_SIGIL: Readonly<Record<Track, "craft" | "body" | "care" | "duty">> = { CRAFT: "craft", BODY: "body", CARE: "care", DUTY: "duty" };

export const START_POINT_WORD: Readonly<Record<StartPoint, string>> = {
  NEW: "New to it",
  BASICS: "Some basics",
  WORKING: "Working knowledge",
  STRONG: "Strong, aiming higher",
};

export const INTENSITY_WORD: Readonly<Record<Intensity, string>> = { LIGHT: "Light", STEADY: "Steady", PUSH: "Push" };

/** "Light 50%, Steady 70%, Push 90%" (from the constants, never typed by hand). */
export function intensityHint(): string {
  const p = (i: Intensity) => `${INTENSITY_WORD[i]} ${Math.round(INTENSITY[i] * 100)}%`;
  return `Scales every fitted target: ${p("LIGHT")}, ${p("STEADY")}, ${p("PUSH")} of what your reviews can be expected to reach.`;
}

export const METHOD_WORD: Readonly<Record<PracticeMethod, string>> = {
  DELIBERATE_PRACTICE: "Deliberate practice",
  READING: "Reading",
  PROJECT_WORK: "Project work",
  COACHED_SESSION: "Coached session",
  WORKOUT: "Workout",
  WRITING: "Writing",
};

export const CHECKPOINT_KIND_WORD: Readonly<Record<CheckpointKind, string>> = {
  MOCK_TEST: "mock test",
  PERFORMANCE_CHECK: "performance check",
  SELF_TEST: "self-test",
  // Revision 4: the exam itself, placed by code on the stage that holds Roadmap.examDay; never offered in a picker.
  EXAM_DAY: "your exam",
};

/** A recurrence rule in words: "3× a week", "every day", "2× a month". */
export function ruleWords(rule: string | null): string {
  if (!rule) return "once";
  const t = rule.trim().toUpperCase();
  if (t === "DAILY") return "every day";
  if (t === "WEEKDAYS") return "on weekdays";
  if (t === "WEEKENDS") return "at weekends";
  const target = /^TARGET:(\d+)\/(W|M)$/.exec(t);
  if (target) return `${target[1]}× a ${target[2] === "W" ? "week" : "month"}`;
  const every = /^EVERY:(\d+)$/.exec(t);
  if (every) return `every ${every[1]} days`;
  return "on a schedule";
}

/** "3× a week · 30 min ≈ 1 h 30/wk". */
export function practicePlanLine(rule: string | null, sessionsPerWeek: number | null, minutes: number | null): string {
  const base = `${ruleWords(rule)}${minutes ? ` · ${minutes} min` : ""}`;
  if (sessionsPerWeek && minutes) return `${base} ≈ ${hoursLabel(sessionsPerWeek * minutes, false)}/wk`;
  return base;
}

// ═══ Provenance chips ════════════════════════════════════════════════════════

/** The chip's words for a string's class (with the decision that made it YOURS). */
export function provenanceChipWords(cls: "YOURS" | "WORKED_OUT" | "KEPT_SUGGESTION" | "DRAFT", checked: boolean): string {
  if (cls === "YOURS") return checked ? "You checked this" : "You wrote this";
  if (cls === "WORKED_OUT") return "Written by the app";
  return PROVENANCE_WORDS[cls];
}

/** Gemini's words carry theirs wherever they are echoed (a sheet's description, a list row): null for YOURS and WORKED_OUT. */
export function geminiWordsOf(cls: TextClass | null | undefined): string | null {
  return cls === "DRAFT" || cls === "KEPT_SUGGESTION" ? PROVENANCE_WORDS[cls] : null;
}

/** A label echoed outside its row ("Risk and position sizing · Gemini suggestion · not checked"). */
export function labelWithClass(label: string, cls: TextClass | null | undefined): string {
  const words = geminiWordsOf(cls);
  return words ? `${label} · ${words}` : label;
}

/**
 * The propagation note of a figure worked out over Domains Gemini picked
 * (F9 Measures, the contract §9.3): "worked out on Gemini's suggested Domains
 * (not checked)" or "(kept, not checked)"; null once they are checked or edited.
 */
export function basisClassNote(cls: ComputedClass | null | undefined): string | null {
  if (cls === "DRAFT") return "worked out on Gemini's suggested Domains (not checked)";
  if (cls === "KEPT_SUGGESTION") return "worked out on Gemini's suggested Domains (kept, not checked)";
  return null;
}

// ═══ Flags and notes (F6) ════════════════════════════════════════════════════

/** A blocking flag's chip word. */
export const FLAG_WORD: Readonly<Record<BlockingFlag, string>> = {
  NUMBER: "Number",
  LOOKS_LIKE_RESOURCE: "Looks like a resource",
  PROPER_NOUN: "A name you didn't write",
  CLAIM_WORDS: "Claim word",
  ABOUT_YOU: "About you",
  CONSTRAINT_CONFLICT: "May clash with your constraints",
  HEALTH: "Health",
  MATCHED_EXISTING: "Matched",
  TOPIC_OUTSIDE_SCOPE: "Outside this milestone",
  AIM_STEP_EARLY: "Too early",
  LANGUAGE_UNCHECKED: "Language not checked",
  // Revision 4 (F-R4-19): a name the app found nowhere in your words; such a gap name is never shown, only counted.
  NOT_IN_YOUR_WORDS: "Not in your words",
};

/** Why a flag blocks bulk keep, in words (shown under the item). */
export function flagReason(flag: BlockingFlag, ctx: { constraints?: string | null; milestoneOrd?: number; milestoneCount?: number } = {}): string {
  switch (flag) {
    case "NUMBER":
      return "Gemini wrote a number; numbers here come from your records or from you.";
    case "LOOKS_LIKE_RESOURCE":
      return "It may name a book, course or other resource. The app can't check that it exists or what it says.";
    case "PROPER_NOUN":
      return "It names something that isn't in your aim, exam or library.";
    case "CLAIM_WORDS":
      return "It makes a claim the app can't check. Keep it only with its own tap, or edit the words.";
    case "ABOUT_YOU":
      return "Says something about you that Gemini can't know.";
    case "CONSTRAINT_CONFLICT":
      return ctx.constraints ? `Your constraints say: "${ctx.constraints}"` : "It may clash with your constraints.";
    case "HEALTH":
      return HEALTH_LINE;
    case "MATCHED_EXISTING":
      return "Matched to one of your Domains by a similar name; check it is the one you mean.";
    case "TOPIC_OUTSIDE_SCOPE":
      return "Its Domain isn't one of this milestone's Domains. At Start: move it to another milestone, or drop it.";
    case "AIM_STEP_EARLY":
      return ctx.milestoneOrd && ctx.milestoneCount
        ? `Reads like the aim itself, in milestone ${ctx.milestoneOrd} of ${ctx.milestoneCount}.`
        : "Reads like the aim itself, before the last milestone.";
    case "LANGUAGE_UNCHECKED":
      return "The app's checks read English only, so this needs your own tap.";
    case "NOT_IN_YOUR_WORDS":
      // Revision 4 (F-R4-19), as R3's FLAG_REASON reads it.
      return "The app found these words nowhere in your aim, outline, exam or chosen Domains.";
  }
}

/**
 * One flag's reason line. The checker's own words name what set it ('Names
 * "Kestrel", which you didn't write: …'), when the row carries them; HEALTH
 * always reads the fixed line; otherwise the generic reason.
 */
export function flagReasonLine(
  flag: BlockingFlag,
  reasons: Partial<Record<BlockingFlag, string>> | null | undefined,
  ctx: Parameters<typeof flagReason>[1] = {}
): string {
  if (flag === "HEALTH") return HEALTH_LINE;
  const own = reasons?.[flag]?.trim();
  if (!own) return flagReason(flag, ctx);
  const line = own.charAt(0).toUpperCase() + own.slice(1);
  return /[.!?]$/.test(line) ? line : `${line}.`;
}

/** A note's chip word (never blocking). */
export const NOTE_WORD: Readonly<Record<ItemNote, string>> = {
  CHECK_LINK: "No card here mentions it yet",
  ADDED_TO_SCOPE: "Added to this milestone's Domains",
  RAISED: "Level kept from falling",
  STUDY_ADDED: "Study time counts in the plan",
  PLACEHOLDER: "Name this practice",
  // Revision 4 (F-R4-18, F-R4-19, F-R4-21): who chose a type or a Domain, in words (never colour alone).
  GEMINI_PICK: "picked by Gemini from the app's list",
  NOT_CHOSEN: "suggested by Gemini · not added yet",
  FROM_SUGGESTION: "named from Gemini's pick of your words, created by you",
  PRODUCTION_ADDED: "added by the app",
};

/** A milestone note's line. */
export const MILESTONE_NOTE_LINE: Readonly<Record<MilestoneNote, string>> = {
  NO_STUDY_SLOT: "No study practice added: this milestone already has 3 — swap one for study if you need it.",
  NOT_MEASURABLE: "No measurable part — add a Domain or a practice.",
  CARDS_TOO_SMALL: "The card target was too small to be a milestone, so it was dropped.",
  HEALTH_LINE,
  // Revision 4 (F-R4-10, F-R4-11, F-R4-13). LONG_WINDOW's figures are longWindowLine's when the milestone's facts are at hand.
  HELD_AT_START: "Held when you began: you already held this stage, so it gives no rank. It counts in Proficiency.",
  LONG_WINDOW: "Writing these cards takes many weeks. Write more a week, or narrow the aim.",
  NO_PRODUCTION_SLOT: "No practice that uses what you know was added: this milestone already has 3 practices. Swap one for a practice type that does.",
  DEPTH_LOWERED: "Dropped when the depth was lowered.",
};

// ═══ Pay (F15; MP only through statedPayoutCopy and the ⬡ glyph) ═════════════

export const ZERO_REASON_LINE: Readonly<Record<StatedZeroReason, string>> = {
  KNOWLEDGE_ONLY: "knowledge is paid by reviews",
  PRACTICE_UNDER_HOUR: "practice under an hour a week",
  PRACTICE_UNDER_SHARE: "practice under a third of this milestone's planned time",
  LINEAGE_PAID: "this milestone already paid",
};

/** A zero reason in words; LINEAGE_PAID carries the day that lineage paid ("this milestone already paid on 3 Mar"). */
export function zeroReasonWords(zeroReason: StatedZeroReason, paidOn?: DayKey | null, today?: DayKey): string {
  if (zeroReason === "LINEAGE_PAID" && paidOn) return `${ZERO_REASON_LINE.LINEAGE_PAID} on ${dayLabel(paidOn, today)}`;
  return ZERO_REASON_LINE[zeroReason];
}

/** "pays ⬡ 6 × progress from 70%" or "pays nothing · knowledge is paid by reviews" ("… already paid on 3 Mar"). */
export function statedLine(stated: number | null, zeroReason: StatedZeroReason | null, paidOn?: DayKey | null, today?: DayKey): string {
  if (stated && stated > 0) return statedPayoutCopy("MID", stated);
  return zeroReason ? `pays nothing · ${zeroReasonWords(zeroReason, paidOn, today)}` : "pays nothing";
}

// ═══ Proficiency and the Aim rank (F12) ══════════════════════════════════════

/** "41%" (floor(100 × value)). */
export function proficiencyPercent(p: ProficiencyView): string {
  return `${p.percent}%`;
}

/** "cards 55% · tested by your reviews · practice 23% · from your ticks · milestones 1 of 6". */
export function proficiencyPartsLine(p: Pick<ProficiencyView, "parts" | "reached" | "scheduled">): string {
  const out: string[] = [];
  if (p.parts.cards != null) out.push(`cards ${goalPercent(p.parts.cards)}% · tested by your reviews`);
  if (p.parts.practice != null) out.push(`practice ${goalPercent(p.parts.practice)}% · from your ticks`);
  if (p.parts.milestones != null) out.push(`milestones ${p.reached} of ${p.scheduled}`);
  return out.join(" · ");
}

const FALL_CAUSE: Readonly<Record<"CARDS_ARCHIVED" | "LEVELS_SLIPPED" | "TICK_UNDONE", (domains: string) => string>> = {
  CARDS_ARCHIVED: (d) => `cards archived or moved out of ${d || "these Domains"}`,
  LEVELS_SLIPPED: (d) => `card levels slipped in ${d || "these Domains"} (a missed or overdue review lowers a level)`,
  TICK_UNDONE: () => "a ticked session was undone",
};

/** The one cause line: "↓ 1 since Sun · card levels slipped in …", or "Changed on Tue 26 Jan · … (was 41%)". In ink, never red. */
export function proficiencyChangeLine(change: ProficiencyChange | null, today?: DayKey): string | null {
  if (!change) return null;
  if (change.kind === "rebased") {
    const r = change.rebase;
    return `Changed on ${dayWithWeekday(r.on, today)} · ${r.detail} (was ${goalPercent(r.from)}%)`;
  }
  return `↓ ${change.points} since ${weekdayName(change.since)} · ${FALL_CAUSE[change.cause](change.domains.join(", "))}`;
}

/** "Proficiency not measured yet — …" (or not recorded on this server). */
export function proficiencyMissingLine(writesOff: boolean): string {
  return writesOff
    ? `Proficiency ${NOT_RECORDED_HERE}`
    : "Proficiency not measured yet — the first reading is recorded when you next open Today or You in the app";
}

/** "Next rank: Journeyman at milestone 2 · rank is kept for good". */
export function nextRankLine(next: NextRank): string {
  switch (next.kind) {
    case "milestone":
      return `Next rank: ${next.name} at milestone ${next.milestoneOrd} · rank is kept for good`;
    case "keeps":
      return `Milestone ${next.milestoneOrd} keeps your rank · rank is kept for good`;
    case "paragon":
      return `Next rank: ${AIM_RANKS[6]} when the aim is reached · rank is kept for good`;
    case "top":
      return "Top rank on this plan · rank is kept for good";
  }
}

/** "Top rank on this plan: Paragon, when the aim is reached." */
export function topRankLine(top: AimRankView["top"]): string {
  return top.withAim ? `Top rank on this plan: ${top.name}, when the aim is reached.` : `Top rank on this plan: ${top.name}.`;
}

/** One rung of "Aim ranks on this plan": "Aspirant · milestone 1 · reached". */
export function ladderRowLine(row: AimRankView["ladder"][number], scheduled: number): string {
  if (row.index === 0) return "from your first acceptance";
  if (row.milestoneOrd == null) return "when the aim is reached";
  const state = row.state === "given" ? " · reached" : row.state === "next" ? " · next rank" : "";
  const keeps = row.index === 5 && scheduled > 5 ? ` · milestone ${scheduled} keeps your rank` : "";
  return `milestone ${row.milestoneOrd}${state}${keeps}`;
}

/** "Reaching it gives the Aim rank Journeyman" / "Reaching it keeps your rank". */
export function givesRankLine(rankIndex: number | null, gives: boolean): string {
  if (rankIndex == null || !gives) return "Reaching it keeps your rank";
  return `Reaching it gives the Aim rank ${AIM_RANKS[Math.max(0, Math.min(6, rankIndex))]}`;
}

/** The rank line split for display: the lead words and the name in bold ("Reaching it gives the Aim rank" + "Journeyman"). */
export function rankLineParts(rankIndex: number | null, gives: boolean): { lead: string; name: string | null } {
  if (rankIndex == null || !gives) return { lead: "Reaching it keeps your rank", name: null };
  return { lead: "Reaching it gives the Aim rank", name: AIM_RANKS[Math.max(0, Math.min(6, rankIndex))] };
}

/** "Reaching the aim gives the Aim rank" + "Paragon". */
export const PARAGON_PARTS: { lead: string; name: string } = { lead: "Reaching the aim gives the Aim rank", name: AIM_RANKS[6] };

/** The same line from a rank name (the Start preview and the Aim card's planned milestone carry the name). */
export function givesRankByName(name: string | null): string {
  return name ? `Reaching it gives the Aim rank ${name}` : "Reaching it keeps your rank";
}

/** The last milestone of a plan of 4 or more. */
export const PARAGON_LINE = `Reaching the aim gives the Aim rank ${AIM_RANKS[6]}`;

// ═══ Pace (F11) ══════════════════════════════════════════════════════════════

/** A card or practice projection in words (never red). */
export function paceLine(pace: PaceResult | PracticePace | null, ctx: { level?: number | null; today?: DayKey } = {}): string | null {
  if (!pace) return null;
  if (pace.kind === "not-measured") return "Pace not measured yet.";
  if (pace.kind === "short") return `About ${plural(pace.sessions, "session")} short.`;
  if (pace.kind === "on-pace") {
    if (!("day" in pace)) return "On pace.";
    const lead = `On pace for ${dayLabel(pace.day, ctx.today)}`;
    const pipe = pace.pipeline > 0 && ctx.level ? ` · ${plural(pace.pipeline, "card")} in the pipeline can reach level ${ctx.level} by then if passed on their day` : "";
    return `${lead}${pipe}${pace.bestCase ? " (best case — your pass rate is still calibrating)" : ""}.`;
  }
  if (pace.kind === "reached") return `Reached ${dayLabel(pace.day, ctx.today)}.`;
  if (pace.kind === "behind") {
    const w = Math.max(1, Math.round(pace.daysLate / 7));
    return `About ${w} ${w === 1 ? "week" : "weeks"} behind: at your pace about ${Math.floor(pace.expectedByDue)} of ${pace.target} by ${dayLabel(pace.day, ctx.today)}.`;
  }
  return "At this pace it is more than two years away.";
}

/** The Aim card's short pace phrase: "on pace for 7 Mar", "about 3 weeks behind". */
export function pacePhrase(pace: PaceResult | PracticePace | null, today?: DayKey): string | null {
  if (!pace) return null;
  if (pace.kind === "on-pace" && "day" in pace) return `on pace for ${dayLabel(pace.day, today)}`;
  if (pace.kind === "on-pace") return "on pace";
  if (pace.kind === "behind") {
    const w = Math.max(1, Math.round(pace.daysLate / 7));
    return `about ${w} ${w === 1 ? "week" : "weeks"} behind`;
  }
  if (pace.kind === "short") return `about ${plural(pace.sessions, "session")} short`;
  if (pace.kind === "reached") return `reached ${dayLabel(pace.day, today)}`;
  if (pace.kind === "far") return "more than two years away at this pace";
  return null;
}

// ═══ Milestones list (F18 §4) ════════════════════════════════════════════════

export const MILESTONE_STATE_WORD: Readonly<Record<MilestoneRowState, string>> = {
  REACHED: "Reached",
  PENDING_REACH: "Reached · counts from",
  CURRENT: "Current",
  PLANNED: "Planned",
  OUTLINE: "Outline",
  LATER: "Later",
  DROPPED: "Dropped",
  SLIPPED: "Slipped",
  PAST_DUE: "Past due",
  CLOSED_UNREACHED: "Closed",
};

/** "Reached · counts from Thu (ticks settle for 2 days)". */
export function pendingReachLine(countsFrom: DayKey): string {
  return `Reached · counts from ${weekdayName(countsFrom)} (ticks settle for 2 days)`;
}

/** The rank block's pending reach, in the same words and date format: "Milestone 2 reached · counts from Thu (ticks settle for 2 days)". */
export function rankPendingLine(milestoneOrd: number, countsFrom: DayKey): string {
  return `Milestone ${milestoneOrd} reached · counts from ${weekdayName(countsFrom)} (ticks settle for 2 days)`;
}

/** A dropped milestone's [Start again] (F15, F22): a new planned copy; unarchiving the goal undoes the drop instead. */
export const START_AGAIN_LINE = "Start again makes a new planned copy with fresh dates; your old goal stays archived.";

/** "Milestone 2 was due Sun 13 Dec — close or reschedule it". */
export function pastDueLine(ord: number, dueDay: DayKey | null, today?: DayKey): string {
  return dueDay ? `Milestone ${ord} was due ${dayWithWeekday(dueDay, today)} — close or reschedule it` : `Milestone ${ord} is past its due day — close or reschedule it`;
}

/** "Closed at 82% · not reached, so it didn't give the Aim rank Journeyman. A later milestone still gives its own Aim rank." */
export function closedUnreachedLine(percent: number | null, rankIndex: number | null): string {
  const at = percent != null ? `Closed at ${percent}%` : "Closed";
  if (rankIndex == null) return `${at} · not reached.`;
  return `${at} · not reached, so it didn't give the Aim rank ${AIM_RANKS[rankIndex]}. A later milestone still gives its own Aim rank.`;
}

// ═══ The aim check ═══════════════════════════════════════════════════════════

/** "Your hours cover 60 of the 150 h you entered (source: SOA study note)", or the unchecked line. */
export function aimCheckLine(check: AimCheck): string {
  if (check.kind === "unchecked") return AIM_UNCHECKED_LINE;
  const src = check.source ? ` (source: ${check.source})` : "";
  if (check.coversAll) return `Your hours cover all of the ${count(check.typicalHours)} h you entered${src}`;
  return `Your hours cover ${count(check.coverHours)} of the ${count(check.typicalHours)} h you entered${src}`;
}

// ═══ Week quests (F17) ═══════════════════════════════════════════════════════

const UNIT_WORDS: Readonly<Record<WeekQuestUnit, [string, string]>> = {
  card: ["card", "cards"],
  session: ["session", "sessions"],
  day: ["day", "days"],
  step: ["step", "steps"],
  log: ["score", "scores"],
};

/** "3 of 8 cards", "1 of 3 sessions", "0 of 1 step"; a checkpoint reads "not logged yet" / "logged". Never a bare "n of N". */
export function weekQuestCountLine(kind: WeekQuestKind, progress: number, total: number, unit: WeekQuestUnit, done: boolean): string {
  if (kind === "CHECKPOINT") return done ? "logged · done" : "not logged yet";
  const [one, many] = UNIT_WORDS[unit];
  const line = `${Math.max(0, Math.floor(progress))} of ${total} ${total === 1 ? one : many}`;
  return done ? `${line} · done` : line;
}

/** "Week quests · Milestone 2". */
export function weekQuestsHeading(ord: number): string {
  return `Week quests · Milestone ${ord}`;
}

/** "Week quests · Milestone 2 · 2 of 5 done" / "… · all 5 done". */
export function weekQuestsSummary(ord: number, done: number, total: number): string {
  return done >= total && total > 0 ? `${weekQuestsHeading(ord)} · all ${total} done` : `${weekQuestsHeading(ord)} · ${done} of ${total} done`;
}

/** "until Sun" (+ "not recorded on this server"). */
export function weekQuestsAside(weekEnd: DayKey, writesOff: boolean): string {
  return writesOff ? `until ${weekdayName(weekEnd)} · ${NOT_RECORDED_HERE}` : `until ${weekdayName(weekEnd)}`;
}

/** The PRACTICE row's extra on the roadmap page. */
export const PRACTICE_KEEP_SHARE_LINE = "the milestone counts 80% of these";

/** The ADD row's extra on the roadmap page. */
export function addCountsLine(ord: number, level: number | null): string {
  return level ? `New cards count toward Milestone ${ord} once they reach level ${level}+.` : `New cards count toward Milestone ${ord} once they reach its level.`;
}

/** The card's footer, per kinds present (a per-kind footer, F17). */
export function weekQuestsFooter(kinds: ReadonlySet<WeekQuestKind>, ord: number, level: number | null): string {
  const moving: string[] = [];
  if (kinds.has("RAISE")) moving.push("Bring");
  if (kinds.has("PRACTICE")) moving.push("session");
  if (kinds.has("STEP")) moving.push("step");
  const parts: string[] = [];
  if (moving.length > 0) {
    const names = listWords(moving).replace(/, and /, " and ");
    const cap = names.charAt(0).toUpperCase() + names.slice(1);
    parts.push(`${cap} rows count toward Milestone ${ord} as you do them`);
  }
  if (kinds.has("ADD")) {
    const tail = level ? `new cards count once they reach level ${level}+` : "new cards count once they reach its level";
    parts.push(parts.length ? tail : `New cards count toward Milestone ${ord} once they reach ${level ? `level ${level}+` : "its level"}`);
  }
  if (kinds.has("CHECKPOINT")) parts.push(parts.length ? "a checkpoint score is for your judgement" : "A checkpoint score is for your judgement");
  return `Week quests pay nothing.${parts.length ? ` ${parts.join("; ")}.` : ""}`;
}

/** The legend under Today's header, naming each kind's evidence once. */
export function weekQuestsLegend(kinds: ReadonlySet<WeekQuestKind>): string {
  const parts: string[] = [];
  if (kinds.has("RAISE")) parts.push("Bring: tested by your reviews");
  if (kinds.has("ADD")) parts.push("Add: counted by the app");
  if (kinds.has("PRACTICE") || kinds.has("STEP")) {
    const who = kinds.has("PRACTICE") && kinds.has("STEP") ? "sessions and steps" : kinds.has("PRACTICE") ? "sessions" : "steps";
    parts.push(`${who}: your ticks`);
  }
  if (kinds.has("CHECKPOINT")) parts.push("checkpoint: you log it");
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** "Week of 28 Sep · 4 of 5 done · capped · 2 days held", or "still settling". Never red. */
export function pastWeekLine(w: { weekStart: DayKey; settled: boolean; done: number; total: number; capped: boolean; heldDays: number }, today?: DayKey): [string, string] {
  const head = `Week of ${dayLabel(w.weekStart, today)}`;
  if (!w.settled) return [head, "still settling"];
  const tail = [`${w.done} of ${w.total} done`];
  if (w.capped) tail.push("capped");
  if (w.heldDays > 0) tail.push(`${plural(w.heldDays, "day")} held`);
  return [head, tail.join(" · ")];
}

// ═══ Small helpers the views share ═══════════════════════════════════════════

/**
 * Where the task lives on Today, with a leading "· ": R6's questPlaceText
 * strings ("in Must", "in Habits", "in Planned", "in Anytime" or "in Inbox"),
 * shown as given and never re-worded.
 */
export function placeSuffix(place: string | null): string {
  return place ? ` · ${place}` : "";
}

/** "Not in this plan yet: S4, S9". */
export function uncoveredLine(indices: readonly number[]): string | null {
  if (indices.length === 0) return null;
  return `Not in this plan yet: ${indices.map((i) => `S${i + 1}`).join(", ")}`;
}

/** [Add as topic] for one uncovered syllabus line (F6 step 8): "Add S4 as a topic". */
export function addAsTopicWord(index: number): string {
  return `Add S${index + 1} as a topic`;
}

/** The Aim card's ACCEPTED caption: "as measured at acceptance on 4 Oct" only for the reading taken that day; otherwise when it was measured. */
export function acceptanceCaption(atAcceptance: boolean, acceptedDay: DayKey | null | undefined, measuredAt: string | null, today: DayKey): string {
  if (atAcceptance && acceptedDay) return `as measured at acceptance on ${dayLabel(acceptedDay, today)}`;
  return measuredLabel(measuredAt, today);
}

/** "Add a figure" (the aim check's figure, F2 Reality check): the sheet's words. */
export const AIM_FIGURE_HOURS_LABEL = "Hours this usually takes";
export const AIM_FIGURE_SOURCE_LABEL = "Where that figure comes from";
export const AIM_FIGURE_NOTE = "Your figure: the aim check compares your hours with it. The app doesn't check the figure itself.";

/** The date the "by" chip shows, and the weeks left. */
export function byLine(targetDay: DayKey, today: DayKey, withWeeks: boolean): string {
  return withWeeks ? `by ${dayLabel(targetDay, today)} · ${weeksLeftLabel(today, targetDay)}` : `by ${dayLabel(targetDay, today)}`;
}

/** The life day `n` days on (re-exported so views need not import life-day). */
export function dayPlus(day: DayKey, n: number): DayKey {
  return addDays(day, n);
}

// ═══ Revision 4 (roadmap-rev4.md): the aim at the centre, depth, keys only ═══
//
// Every string below is code's. The invitation copy (the ASK card, the LATER
// line, Today's aim line, the form's notes) never names Gemini and never says
// "earn", the M-word, the MP glyph or a bare "quest" (roadmap-ui-check pins
// each). "Mastered" appears only as the stage name of level 12, with
// "(level 12)" on first use in a block; "Depth" is always followed by its
// stage and level.

/** "4" weeks: the snooze in words, from AIM_LATER_DAYS. */
const LATER_WEEKS = Math.round(AIM_LATER_DAYS / 7);

/** "Mastered (level 12)", "Fluent (level 10)", "Toward Mastered (level 11)", "Familiar, part 1 (level 6)"; a level with no stage reads "level 9". */
export function stageLevelName(level: number, stage?: StageKey | string | null): string {
  const named = stage ? stageLabelOf(stage, level) : null;
  if (named) return `${named} (level ${level})`;
  const gate = stageOfLevel(level);
  if (gate) return `${STAGE_NAMES[gate]} (level ${level})`;
  const above = stageOfLevel(level + 1);
  return above ? `Toward ${STAGE_NAMES[above]} (level ${level})` : `level ${level}`;
}

/** A depth's name: "Mastered (level 12)". */
export function depthName(depth: AimDepth): string {
  return stageLevelName(depth);
}

/** A depth's stage name alone ("Mastered"), for a chip that carries no level. */
export function depthStage(depth: AimDepth): string {
  const gate = stageOfLevel(depth);
  return gate ? STAGE_NAMES[gate] : `level ${depth}`;
}

/** "Milestone 2 · Familiar (level 6)" (a track or legacy row: "Milestone 2"). */
export function milestoneStageLine(ord: number, stage: StageKey | string | null | undefined, gateLevel: number | null | undefined): string {
  const named = stage ? stageLabelOf(stage, typeof gateLevel === "number" ? gateLevel : undefined) : null;
  if (!named) return `Milestone ${ord}`;
  return typeof gateLevel === "number" ? `Milestone ${ord} · ${named} (level ${gateLevel})` : `Milestone ${ord} · ${named}`;
}

/** The stage's words alone, with its level: "Familiar (level 6)"; null on a track or legacy row. */
export function stageWords(stage: StageKey | string | null | undefined, gateLevel: number | null | undefined): string | null {
  const named = stage ? stageLabelOf(stage, typeof gateLevel === "number" ? gateLevel : undefined) : null;
  if (!named) return null;
  return typeof gateLevel === "number" ? `${named} (level ${gateLevel})` : named;
}

/** "about 110 days": the gap a card at L* came through, interval(L* − 1, m), rounded to 5 (F-R4-9). */
export function depthGapDays(depth: number, m: number): number {
  return Math.max(5, Math.round(interval(Math.max(1, depth - 1), m) / 5) * 5);
}

/** "3 Mar 2028": a day with its year, always (a last aim, a choice's day). */
export function dateFull(day: DayKey): string {
  const [y, m, d] = partsOf(day);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Sun 4 Apr 2027". */
export function dayFull(day: DayKey): string {
  return `${weekdayName(day)} ${dateFull(day)}`;
}

/** "Nov 2027" (the Aim card's date chip). */
export function monthYear(day: DayKey): string {
  const [y, m] = partsOf(day);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "A and B", "A, B and C" (no Oxford comma: the spec's copy). */
export function andList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// ─── The invitation (F-R4-1 to F-R4-3, F-R4-5) ───

export const AIM_CALL_HEADING = "Set an aim";
export const AIM_CALL_BODY = "What do you want to be able to do in a year or three? The app plans milestones toward it and measures them from your reviews and ticks.";
/** True as written (decision 40): ranks follow the stages reached inside the plan; Paragon is the aim held at Mastered (level 12). */
export const AIM_CALL_RANK_LINE = `Stages you reach raise your Aim rank, from ${AIM_RANKS[0]} toward ${AIM_RANKS[6]}: the aim held at ${STAGE_NAMES.MASTERED} (level ${STAGE_LEVEL.MASTERED}).`;
export const AIM_CALL_LABEL = "Your aim, in your words";
export const AIM_CALL_PLACEHOLDER = "Something you want to be able to do";
export const AIM_CALL_CONTINUE_LINE = "Continue where you left off";
export const AIM_CALL_PRIMARY = "Set an aim";
export const AIM_CALL_PRIMARY_TEXT = "Continue";
export const AIM_NOT_NOW = "Not now";
export const AIM_DONT_SUGGEST = "Don't suggest this";
/**
 * Every × on an aim surface means "Not now" and says so (decision 34). This
 * label has one meaning wherever it shows (/you's LATER line, Today's SET
 * line): the 'hide:' cookie (hideAimPrompt), so neither surface suggests an
 * aim for 4 weeks (fix round 2).
 */
export const AIM_NOT_NOW_SET_LABEL = `Not now: no aim suggestions for ${LATER_WEEKS} weeks`;
export const AIM_NOT_NOW_STEP_LABEL = "Not now: hide this for a week";
export const AIM_OFF_TOAST = "Aim suggestions are off. Turn them back on in Settings.";
/** The Undo on AIM_OFF_TOAST didn't go through: say so, and where the switch is. */
export const AIM_UNDO_FAILED = "Couldn't turn them back on. Settings › Aim suggestions.";
/** The LATER line's words after its "Set an aim" link. */
export const AIM_LATER_TAIL = " → milestones toward it, measured from your reviews and ticks";
export const AIM_NEXT_AIM = "Set your next aim";
export const AIM_NEW_AIM = "Set a new aim";
export const AIM_HISTORY_LINE = "This roadmap stays here as history.";
/** The NONE card's Gemini line: only while ROADMAP_GEMINI_LIVE and a key both hold. */
export const NONE_GEMINI_LINE = "Gemini can arrange it into milestones; the app writes every word and number.";

/** "Start from your long goal “Read Japanese manga without a dictionary”". */
export function seedLine(title: string): string {
  return `Start from your long goal “${title}”`;
}

/** "Last aim: “<aim>” · Aim rank Paragon · reached 3 Mar 2028" (or "· closed 3 Mar 2028" when it ended unreached). */
export function lastAimLine(last: Pick<LastAimView, "aim" | "rankName" | "reached" | "day">): string {
  return `Last aim: “${last.aim}” · ${lastAimRankLine(last)}`;
}

/** The achievement half of the last-aim line, which never clips: "Aim rank Paragon · reached 3 Mar 2028". */
export function lastAimRankLine(last: Pick<LastAimView, "rankName" | "reached" | "day">): string {
  return `Aim rank ${last.rankName} · ${lastAimDayLine(last)}`;
}

/** "reached 3 Mar 2028" or "closed 3 Mar 2028". */
export function lastAimDayLine(last: Pick<LastAimView, "reached" | "day">): string {
  return `${last.reached ? "reached" : "closed"} ${dateFull(last.day)}`;
}

/** The DONE card's held depth: "Mastered (level 12) in Probability and Inference · confirmed 3 Mar 2028". */
export function heldDepthLine(h: { depth: AimDepth; domainNames: readonly string[]; confirmedDay: DayKey }): string {
  return `${depthName(h.depth)} in ${andList(h.domainNames)} · confirmed ${dateFull(h.confirmedDay)}`;
}

/** The Aim card's date chip (F-R4-11): "Mastered (level 12) by Nov 2027", or "Mastered (level 12) by about Nov 2027 · estimate" while calibrating. */
export function depthDateChip(c: { depth: AimDepth; day: DayKey; estimate: boolean }): string {
  return c.estimate ? `${depthName(c.depth)} by about ${monthYear(c.day)} · estimate` : `${depthName(c.depth)} by ${monthYear(c.day)}`;
}

/** Today's aim line (F-R4-3): the lead in bold, then the rest. Never behind, late, overdue, missed or due-day copy. */
export function aimLineCopy(v: AimLineView): { lead: string; rest: string } {
  const ask = "what do you want to be able to do in a year or three?";
  if (v.kind === "SET") {
    if (v.variant === "NEXT") return { lead: "Your last aim is done.", rest: `Set the next one: ${ask}` };
    const lead = v.variant === "MONTH" ? "A new month." : v.variant === "BACK" ? "Welcome back." : "A new week.";
    return { lead, rest: `Set an aim: ${ask}` };
  }
  if (v.kind === "DRAFT") return { lead: "A roadmap draft is waiting for your check.", rest: "" };
  const lead = v.stageName ? `Milestone ${v.ord} · ${v.stageName} is ready to start.` : `Milestone ${v.ord} is ready to start.`;
  return { lead, rest: v.givesRank ? `${givesRankByName(v.givesRank)}.` : "It keeps your rank." };
}

/**
 * The intake's note by where the aim came from (F-R4-1, F-R4-7, F-R4-16).
 * 'restart' names only what the form really took over (fix round 2, lens 3
 * #17): its aim always; the Area when the handoff's Area was applied; its
 * Domains only when the handoff carried the old plan's own (otherwise the
 * form preselects the Area's Domains, which were not "carried over").
 */
export function handoffNote(source: "you" | "goal" | "capture" | "restart", aim: string, carried?: { area: boolean; domains: boolean }): string {
  switch (source) {
    case "you":
      return "Carried over from your character page. Pick what it grows below.";
    case "goal":
      return `From your long goal “${aim}”. The goal stays as it is on Today.`;
    case "capture":
      return "From your capture line.";
    case "restart": {
      const what = carried?.area && carried.domains ? "its aim, Area and Domains are" : carried?.area ? "its aim and Area are" : "its aim is";
      return `From your plan made before plans aimed at a depth: ${what} carried over. Saving this archives that plan.`;
    }
  }
}

/** With an open DRAFT the draft wins: "Your open draft is shown. The aim you typed: “…”" and [Use it]. */
export function openDraftNote(aim: string): string {
  return `Your open draft is shown. The aim you typed: “${aim}”`;
}

// ─── The intake (F-R4-4, F-R4-9, F-R4-24) ───

export const AIM_LONG_HINT = "Think a year or more out: something you want to be able to do, not a task.";
export const VAGUE_AIM_LINE = "Say what you'll be able to do, and how well: something you could show someone.";
export const WHEN_REALISTIC = "When realistic";
export const EXAM_WAYPOINT_HINT = "Your exam date is a waypoint: the depth goes on past it.";
export const NEW_CARDS_REQUIRED_HINT = "The app needs a pace to date your milestones. Your rate, not yet measured.";
export const EXAM_QUESTION = "Is there an exam or qualification at the end?";
/**
 * The practice family question (contracts §20.11; a Field Area with practices
 * on): which kind of skill the aim trains, so code's progression trains it.
 * The user's answer (Intake.practiceFamily), prefilled by code's reading of
 * the aim (practiceFamilyPrefillOf). Each answer's line says, in code's
 * words, what the practices go from and to (the family's table).
 */
export const FAMILY_QUESTION = "What kind of skill is it?";
export const FAMILY_WORD: Readonly<Record<PracticeFamily, string>> = {
  KNOW: "Knowledge",
  LANGUAGE: "A language",
  PERFORM: "Doing or playing",
  BUILD: "Making things",
};
export const FAMILY_HINT: Readonly<Record<PracticeFamily, string>> = {
  KNOW: "The practices go from study and recall to problems and explaining it in your own words.",
  LANGUAGE: "The practices go from listening and repeating to saying it aloud, writing and practising with a partner.",
  PERFORM: "The practices go from slow, focused drills to full run-throughs and practising with a teacher or partner.",
  BUILD: "The practices go from study and recall to problems and building things.",
};
/** Under the family answer while the user hasn't touched it (the exam question's own words). */
export const FAMILY_PREFILL_HINT = "Prefilled from your aim; yours to change.";
export const EXAM_NAME_LABEL = "The exam or qualification";
export const EXAM_DATE_LABEL = "When is it? (optional)";
export const OUTLINE_EXAM_LABEL = "Official syllabus: paste the topic list from the official source";
export const OUTLINE_LABEL = "Your outline: what this covers, one per line — from an official source or your own list";
export const LINE_NO_DOMAIN = "Not tied to a Domain";
export const NAME_AREAS_LABEL = "Name the areas this needs";
export const NAME_AREAS_HINT = "Not sure what it covers? Paste the official outline or syllabus from a source you trust, one topic per line.";
export const COVERAGE_TITLE = "How many cards each Domain needs";
export const SUGGEST_AREAS_LABEL = "Let Gemini suggest areas you don't have yet (picked from your own words; not checked)";

/** The Depth control's hint, computed from the user's interval multiplier ("about 110" is interval(11, m) rounded to 5). */
export function depthHint(depth: AimDepth, m: number): string {
  return `${depthName(depth)}: each card passes its review after a gap of about ${depthGapDays(depth, m)} days at the first try. Multiple-choice cards don't count. A lower depth is your choice and stays on the plan.`;
}

/** "When realistic": the floors at the user's m (computed, never typed). */
export function realisticHint(m: number): string {
  return `The app dates each milestone from your cards and pace. A new card needs at least ${floorBase(12, m)} days of spaced reviews to reach level 12 (${STAGE_NAMES.MASTERED}), ${floorBase(10, m)} for level 10.`;
}

/** A chosen date: over the floor, or under it. */
export function chosenDateHint(day: DayKey, today: DayKey, depth: AimDepth | null, m: number): string {
  const span = daysBetween(today, day);
  if (depth != null && span < floorBase(depth, m)) return `That is before a new card can reach level ${depth} here. The draft will offer the realistic date, a lower depth, or to keep yours.`;
  return `${dayFull(day)} · ${count(span)} days from today. The draft says what this date means for your depth.`;
}

/** A By-when chip's verdict word under its label: "possible" or "before level 12 is possible". */
export function chipVerdict(possible: boolean, depth: AimDepth): string {
  return possible ? "possible" : `before level ${depth} is possible`;
}

/** "Steady counts on 70% of your usual pace, so a lean week doesn't break the plan." (decision 39; from INTENSITY). */
export function paceShareHint(i: Intensity): string {
  return `${INTENSITY_WORD[i]} counts on ${Math.round(INTENSITY[i] * 100)}% of your usual pace, so a lean week doesn't break the plan.`;
}

/** "a", "a and b", "a, b, and c": a list of clauses in the copy's own voice. */
function clauses(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * "Draft with Gemini" says what it will do (F-R4-24; contracts §20: its v4
 * part, only while ROADMAP_GEMINI_LIVE and a key), naming only what the run
 * will ask (roadmap-ui-model geminiAsksOf): put the outline in order (an
 * outline), suggest Domains (a Field Area with a Domain not in the plan),
 * and choose at most one practice per stage from the app's options
 * (practices on); the app builds the rest. Nothing to ask: null (the form
 * offers only "Build from my numbers", with GEMINI_NOTHING_TO_ASK_LINE).
 */
export function geminiArrangesLine(asks: { lines: number; needs: boolean; picks: boolean } | null): string | null {
  if (!asks) return null;
  const what = [
    ...(asks.lines > 0 ? [`put your ${plural(asks.lines, "outline line")} in order`] : []),
    ...(asks.needs ? ["suggest which of your other Domains the aim may need"] : []),
    ...(asks.picks ? ["choose at most one practice per stage from the app's options"] : []),
  ];
  if (what.length === 0) return null;
  return `Gemini will ${clauses(what)}; the app builds the rest and writes every word.`;
}

/** The form with nothing for Gemini to decide (geminiAsksOf null): why only "Build from my numbers" is offered. */
export const GEMINI_NOTHING_TO_ASK_LINE =
  "Practices are off, there is no outline, and all of the Area's Domains are in the plan, so there is nothing for Gemini to choose: the app builds it from your numbers. Turn practices on or add an outline to draft with Gemini.";

/** One coverage row (F-R4-9): "Probability · 34 cards: the most of the 25-card floor, 80% of your 42 (34), and 3 × 8 outline lines (24)". */
export function coverageRowLine(c: Pick<CoverageBreakdown, "name" | "n" | "floor" | "share" | "outline" | "live" | "linesTied" | "linesShared" | "typed" | "policy">): string {
  const lines = c.linesTied + c.linesShared;
  const linesWords = Number.isInteger(lines) ? count(lines) : lines.toFixed(1);
  const policy = `the most of the ${c.floor}-card floor, ${Math.round(COVER_SHARE * 100)}% of your ${count(c.live)} (${c.share}), and ${CARDS_PER_OUTLINE_LINE} × ${linesWords} outline lines (${c.outline})`;
  if (c.typed != null) return `${c.name} · ${plural(c.n, "card")}: your figure; the app's is ${c.policy}, ${policy}`;
  return `${c.name} · ${plural(c.n, "card")}: ${policy}`;
}

/** "4 outline lines aren't tied to a Domain: S3, S7, S9, S12. They raise every Domain's count, but no card is checked against them." */
export function unassignedLinesLine(indices: readonly number[], overMax = false): string | null {
  if (indices.length === 0) return null;
  const s = indices.map((i) => `S${i + 1}`).join(", ");
  const head =
    indices.length === 1
      ? `1 outline line isn't tied to a Domain: ${s}. It raises every Domain's count, but no card is checked against it.`
      : `${indices.length} outline lines aren't tied to a Domain: ${s}. They raise every Domain's count, but no card is checked against them.`;
  return overMax ? `${head} A plan holds up to ${DEPTH_DOMAINS_MAX} Domains.` : head;
}

/** "42 cards · 6 multiple choice not counted" (wherever a Domain's count is shown on a depth plan). */
export function recallCountLine(cards: number, nonRecall: number | null): string {
  if (nonRecall == null || nonRecall <= 0) return plural(cards, "card");
  return `${plural(cards, "card")} · ${nonRecall} multiple choice not counted`;
}

// ─── Depth, dates and choices on the plan (F-R4-15) ───

/**
 * The Depth line: "Depth: Mastered (level 12) in Probability and Inference:
 * 34 and 25 cards, each passing its review after a gap of about 110 days at
 * the first try. Multiple-choice cards don't count. The 25-card floor and the
 * 80% share are the app's policy, not facts about these subjects. Change
 * them if you know better."
 */
export function depthLine(depth: AimDepth, coverage: readonly Pick<CoverageBreakdown, "name" | "n">[], m: number): string {
  const names = andList(coverage.map((c) => c.name));
  const counts = andList(coverage.map((c) => count(c.n)));
  const domains = coverage.length > 0 ? ` in ${names}: ${counts} ${coverage.length === 1 && coverage[0].n === 1 ? "card" : "cards"},` : ",";
  return `Depth: ${depthName(depth)}${domains} each passing its review after a gap of about ${depthGapDays(depth, m)} days at the first try. Multiple-choice cards don't count. The ${COVER_FLOOR_CARDS}-card floor and the ${Math.round(COVER_SHARE * 100)}% share are the app's policy, not facts about these subjects. Change them if you know better.`;
}

/** "Risk Management: suggested by Gemini, added by you on 5 Oct." (GEMINI_NEEDS) or the suggestion-created Domain's line (GEMINI_GAP). */
export function domainOriginLine(name: string, origin: DomainOrigin, today?: DayKey): string | null {
  if (origin.by === "GEMINI_NEEDS") return `${name}: suggested by Gemini, added by you on ${dayLabel(origin.day, today)}.`;
  if (origin.by === "GEMINI_GAP") return `${name}: named from Gemini's pick of your words, created by you on ${dayLabel(origin.day, today)}.`;
  return null;
}

/** "Probability: 5 cards, below the app's 34, your choice on 5 Oct." (decision 53; for the life of the plan). */
export function coverageChoiceLine(name: string, c: Pick<CoverageChoice, "policy" | "typed" | "day">, today?: DayKey): string {
  return `${name}: ${plural(c.typed, "card")}, below the app's ${c.policy}, your choice on ${dayLabel(c.day, today)}.`;
}

export const COVERAGE_UNCHECKED_LINE = "Coverage unchecked: no outline.";

/** "Depth: Fluent (level 10) — below Mastered, your choice on 5 Oct." / "— set by your exam date on 5 Oct." */
export function depthChoiceLine(c: Pick<DepthChoice, "from" | "to" | "day" | "reason">, today?: DayKey): string {
  const why = c.reason === "EXAM" ? `set by your exam date on ${dayLabel(c.day, today)}` : `your choice on ${dayLabel(c.day, today)}`;
  return `Depth: ${depthName(c.to)} — below ${depthStage(c.from)}, ${why}.`;
}

/** "By your exam (Sun 4 Apr 2027) the plan reaches Retained (level 8). The depth goes on past it." */
export function examWaypointLine(day: DayKey, level: number | null): string {
  return level != null
    ? `By your exam (${dayFull(day)}) the plan reaches ${stageLevelName(level)}. The depth goes on past it.`
    : `By your exam (${dayFull(day)}) the plan reaches no stage yet. The depth goes on past it.`;
}

/** "By your date the plan reaches Retained (level 8)." (reachByUserDate) */
export function userDateWaypointLine(level: number): string {
  return `By your date the plan reaches ${stageLevelName(level)}.`;
}

export const NEVER_LOWERED_LINE = "The app doesn't lower the depth to fit a date. A lower depth is your choice and stays on the plan.";

/** The coverage honesty line: the app tests the cards; whether they cover the aim is the user's to judge. */
export function coverageJudgeLine(aim: string): string {
  return `The app tests whether you hold the cards you wrote. Whether they cover everything '${aim}' needs is yours to judge: your outline and your standard are the outside checks.`;
}

/** The Paragon line, naming the count of required Domains (never "every Domain"). */
export function paragonDepthLine(domains: number): string {
  return `${AIM_RANKS[6]}: every one of your ${domains} required ${domains === 1 ? "Domain" : "Domains"} held at level 12, the final milestone reached, the plan's practice kept, and your standard logged at or above your bar. Cards tested by your reviews; practice and score from your ticks and your log.`;
}

/** The schedule-bound line (F-R4-11), from the floor at the user's m. */
export function scheduleBoundLine(depth: number, m: number): string {
  return `This date is set by the review schedule, not your hours: a new card needs at least ${floorBase(depth, m)} days to reach level ${depth}. More hours won't bring it much closer.`;
}

/** A date the app set is never called the user's choice: "the date the app set on 5 Oct". */
export function dateAppSetLine(day: DayKey, today?: DayKey): string {
  return `the date the app set on ${dayLabel(day, today)}`;
}

/** The verdict on the user's date as a word (a word and a glyph, never colour alone). */
export const DATE_VERDICT_WORD: Readonly<Record<DateVerdict, string>> = { FITS: "Fits", TIGHT: "Tight", OVER: "Over", IMPOSSIBLE: "Impossible" };

/** [Use Sun 21 Nov 2027] (USE_REALISTIC_DATE). */
export function realisticDateWord(day: DayKey): string {
  return `Use ${dayFull(day)}`;
}
/**
 * An accepted plan whose own date the user kept over the pace (F-R4-15 "Your
 * date"): "Your date is 8 weeks ahead of your pace — kept as you chose
 * (Over)." Only for a date the user set (dateOrigin USER): a date the app set
 * is never "as you chose". null when the realistic date isn't later.
 */
export function overKeptLine(userDay: DayKey, realDay: DayKey | null): string | null {
  if (!realDay || realDay <= userDay) return null;
  const weeks = Math.max(1, Math.round((Date.parse(`${realDay}T00:00:00Z`) - Date.parse(`${userDay}T00:00:00Z`)) / (7 * 86_400_000)));
  return `Your date is ${weeks} ${weeks === 1 ? "week" : "weeks"} ahead of your pace — kept as you chose (Over).`;
}
export const KEEP_MY_DATE = "Keep my date";
export const KEEP_OVER_SWITCH = "Keep my date over my pace";
export const LOWER_DEPTH_WORD = "Choose a lower depth…";
export const LOWER_DEPTH_TITLE = "Choose a lower depth";
export const LOWER_DEPTH_NOTE = "A lower depth is your choice: the plan shows it for good, Proficiency is measured toward the new depth, and Paragon is off. Ranks already given stay.";
export const BY_YOUR_EXAM_MARK = "what you'd hold by your exam";

/** What keeps Paragon closed, in words (F-R4-12): the first missing condition. */
export const PARAGON_MISSING_WORD: Readonly<Record<ParagonMissing, string>> = {
  DEPTH: `${AIM_RANKS[6]} needs the depth ${STAGE_NAMES.MASTERED} (level ${STAGE_LEVEL.MASTERED})`,
  STANDARD: `${AIM_RANKS[6]} needs a standard you set`,
  COVERAGE: `${AIM_RANKS[6]} needs each required Domain's coverage at the app's policy or above`,
  PRODUCTION: `${AIM_RANKS[6]} needs practice that uses what you know from ${STAGE_NAMES.FLUENT} on`,
  STAGES: `${AIM_RANKS[6]} needs at least ${PARAGON_MIN_MILESTONES} kept stages`,
  SPAN: `${AIM_RANKS[6]} needs a plan of at least ${TRACK_PARAGON_MIN_DAYS} days`,
};

/** "Top rank on this plan: Virtuoso — Paragon needs a standard you set." (or rev 3's line when Paragon is open). */
export function topRankDepthLine(top: AimRankView["top"], missing: readonly ParagonMissing[]): string {
  if (missing.length === 0 || top.index >= 6) return topRankLine(top);
  return `Top rank on this plan: ${top.name} — ${PARAGON_MISSING_WORD[missing[0]]}.`;
}

export const PRODUCTION_PARAGON_LINE = `${AIM_RANKS[6]} needs practice that uses what you know from ${STAGE_NAMES.FLUENT} on. Allow practices to keep it open.`;
/** The Close sheet line of an intermediate stage (F-R4-12). */
export const CLOSE_SHORT_PARAGON_LINE = `Closing short doesn't change ${AIM_RANKS[6]}: it needs the final stage, the depth, the plan's practice overall and your standard.`;

/** The ladder disclosure's fixed line (F-R4-12), from the floor at L* (spacing × 1). */
export function proficiencyFloorLine(depth: number): string {
  return `Proficiency counts review time: a level-${depth} card has come through about ${floorBase(depth, 1)} days of spacing, so early stages read low. Your Aim rank records each stage you reach.`;
}

/** A held stage's row: "Held when you began · Specialist level" (it gives no rank). */
export function heldRowLine(rankIndex: number | null): string {
  return rankIndex != null ? `Held when you began · ${AIM_RANKS[Math.max(0, Math.min(6, rankIndex))]} level` : "Held when you began";
}

/** The Start sheet's pay honesty line (F-R4-13): the stated pay rests on a practice the app added. */
export function restsOnAddedLine(stated: number, name: string): string {
  return `It ${statedLine(stated, null)} because of the practice the app added (${name}). Switch it off and this milestone pays nothing.`;
}

/** The CALIBRATED trigger's two taps (F-R4-11). */
export const REDATE_WORD = "Re-date";
export const KEEP_DATES_WORD = "Keep the dates";
export const REDATE_NOTE = "Re-dating moves only the stages you haven't started. It never lowers a count or a level.";

// ─── Keys-only drafts (F-R4-17 to F-R4-21) ───

/** What a v4 reply decided (roadmap-ui-model GeminiV4Parts; structural, so lib-free callers can pass it). */
export interface GeminiV4PartsWords {
  needs: boolean;
  order: "MOVED" | "KEPT" | null;
  picks: number;
  picked: boolean;
  field: boolean;
}

/**
 * The v4 draft header (contracts §20; a keys-only Gemini draft from
 * PROGRESSION_PROMPT_VERSION on), naming only the parts the run asked and
 * the reply used (roadmap-ui-model geminiV4PartsOf): the Domains it
 * suggested, the outline's order (moved, or yours kept), the practices
 * still marked as its choice; then the app's part (every practice, step and
 * checkpoint, each stage building on the one before; "chose every practice"
 * when Gemini picked none), and where the names come from (the aim, plus the
 * outline and Domains on a Field Area).
 */
export function geminiV4LeadLine(p: GeminiV4PartsWords): string {
  const did = [
    ...(p.needs ? ["suggested which of your other Domains the aim may need"] : []),
    ...(p.order === "MOVED" ? ["put your outline lines in order"] : p.order === "KEPT" ? ["kept your outline lines in your order"] : []),
    ...(p.picks > 0
      ? [`chose ${p.picks === 1 ? "the practice" : "each practice"} marked as Gemini's choice, among the app's options`]
      : p.picked
        ? ["chose practices among the app's options that you have since changed"]
        : []),
  ];
  const gemini = did.length > 0 ? `Gemini ${clauses(did)}.` : "Gemini's reply left every choice to the app.";
  const app = p.picked
    ? "The app placed every practice, step and checkpoint, each stage building on the one before."
    : "The app chose every practice and placed every step and checkpoint, each stage building on the one before.";
  const from = !p.field ? "your aim" : p.order != null ? "your aim, outline and Domains" : "your aim and Domains";
  return `${gemini} ${app} Gemini wrote none of the words: every name here is the app's or comes from ${from}, and every number is worked out by the app.`;
}
/** The v4 header with every part used: Domains suggested, the outline moved, practices picked (a Field Area). */
export const GEMINI_V4_LEAD_LINE = geminiV4LeadLine({ needs: true, order: "MOVED", picks: 2, picked: true, field: true });
/** A keys-only draft from before the progression (promptVersion 3): that reply chose every type itself, from the app's whole list. */
export const GEMINI_V3_LEAD_LINE =
  "Gemini arranged your outline into milestones, suggested which of your other Domains the aim may need, and chose the practice, step and checkpoint types from the app's list. It wrote none of the words: every name here is the app's or comes from your aim, outline and Domains, and every number is worked out by the app.";
/**
 * The arrangement line on a v4 Gemini run (contracts §20), naming only what
 * Gemini arranged that still stands: the outline's order when it moved your
 * lines, and the practices still marked as its choice. null when neither (the
 * order is yours, every practice the app's or yours): no arrangement line.
 */
export function arrangementV4Line(p: Pick<GeminiV4PartsWords, "order" | "picks">): string | null {
  const moved = p.order === "MOVED";
  if (moved && p.picks > 0) return "The order of your outline lines is Gemini's suggestion, and so is each practice marked as Gemini's choice. Move a line or change a practice if it doesn't fit.";
  if (moved) return "The order of your outline lines is Gemini's suggestion. Move a line if it doesn't fit.";
  if (p.picks > 0) return `${p.picks === 1 ? "The practice" : "Each practice"} marked as Gemini's choice is its suggestion; the app's default is named under it. Change it if it doesn't fit.`;
  return null;
}
/** The v4 arrangement line with both parts (the outline moved, practices picked). */
export const ARRANGEMENT_V4_LINE = arrangementV4Line({ order: "MOVED", picks: 2 }) as string;
/** The arrangement line, on a v3 Gemini run only. */
export const ARRANGEMENT_LINE = "Which outline lines and practice types sit in which milestone is Gemini's suggestion. Move a line or change a practice if it doesn't fit.";
/** A REJECTED reply's banner (F-R4-20). */
export const RUN_REJECTED_LINE = "Gemini's reply didn't keep to the app's format, so none of it is used. Here is a plan from your numbers; every check still runs.";

/**
 * "How this was drafted" (F-R4-20): never a model word, only counts. "n not
 * shown" is gapsNotShownOf (hidden + dropped; the contract §15.5): every name
 * Gemini returned that isn't shown is counted, the shape-dropped ones too.
 */
export function integrityLine(integrity: Pick<ValidationIntegrity, "verdict" | "gapsKept" | "gapsHidden"> & Partial<Pick<ValidationIntegrity, "gapsDropped">>): string {
  if (integrity.verdict === "REJECTED") return "Rejected (format) · plan from your numbers";
  const parts = ["Gemini's reply: keys only"];
  if (integrity.gapsKept > 0) parts.push(`${plural(integrity.gapsKept, "area name")} picked from your words (not checked)`);
  else parts.push("0 words of its own");
  const notShown = gapsNotShownOf(integrity);
  if (notShown > 0) parts.push(`${notShown} not shown`);
  return parts.join(" · ");
}

/**
 * Who wrote a Gemini run's rows when the app's starter stands in its place
 * (RunTable's "Drafted by"), keyed on the cause: a reply that broke the
 * format (integrity REJECTED), a reply the tripwire refused ("reply refused:
 * …"), or no usable answer. Never "Gemini didn't answer" when it did.
 */
export const STARTER_WROTE_NO_ANSWER = "the app (Gemini didn't answer)";
export const STARTER_WROTE_REJECTED = "the app (Gemini's reply was rejected)";
export const STARTER_WROTE_REFUSED = "the app (Gemini's reply was refused)";
export function starterWriterWords(run: { error?: string | null; report?: { integrity?: Pick<ValidationIntegrity, "verdict"> | null } | null }): string {
  if (run.report?.integrity?.verdict === "REJECTED") return STARTER_WROTE_REJECTED;
  if (/^reply refused\b/.test(run.error ?? "")) return STARTER_WROTE_REFUSED;
  return STARTER_WROTE_NO_ANSWER;
}

/** A catalog type's short name (pickers, the exclusions line, the session-picks confirm). Code's words. */
export const KIND_NAME: Readonly<Record<CatalogKey, string>> = {
  RECALL_DRILLS: "Recall drills",
  PROBLEM_SETS: "Problem sets",
  TIMED_PRACTICE: "Timed practice",
  SLOW_DRILLS: "Slow, focused drills",
  RUN_THROUGHS: "Full run-throughs",
  READ_AND_CARD: "Study and write cards",
  LISTEN_AND_REPEAT: "Listen and repeat",
  SAY_IT_ALOUD: "Say it aloud",
  WRITING_PRACTICE: "Writing practice",
  EXPLAIN_IT: "Explain it in your own words",
  BUILD_SOMETHING: "Build something",
  WITH_A_PARTNER: "Practise with a teacher or partner",
  MISTAKE_REVIEW: "Go over your mistakes",
  EASY_SESSION: "Easy session",
  HARDER_SESSION: "Harder session",
  LONGER_SESSION: "Longer session",
  STRENGTH_SESSION: "Strength session",
  MOBILITY_SESSION: "Mobility session",
  TECHNIQUE_SESSION: "Technique session",
  SET_TIME: "Set time",
  CHECK_IN: "Check-in",
  ADMIN_SESSION: "Admin session",
  PLAN_AHEAD: "Plan the week ahead",
  KEEP_A_LOG: "Keep a log",
  OUTLINE: "Write an outline",
  EXPLAIN_ONCE: "Explain it to someone without notes",
  SMALL_PROJECT: "Finish a small project",
  LIST_GAPS: "List what you still can't do",
  CHOOSE_MATERIAL: "Choose your material",
  SET_UP: "Set up what you need",
  BOOK_EXAM: "Book the exam",
  FULL_ATTEMPT: "Do a full attempt",
  SELF_TEST: "Self-test",
  PERFORMANCE_CHECK: "Performance check",
  MOCK_TEST: "Mock test",
  EXAM_DAY: "Exam",
};

/** A type's "How" lines (F-R4-18): the catalog's plain procedure (roadmap-catalog catalogHowOf); METHOD_HOW stays the fallback. */
export const KIND_HOW: Readonly<Record<CatalogKey, readonly string[]>> = Object.fromEntries(CATALOG.map((e) => [e.key, catalogHowOf(e.key)])) as Record<CatalogKey, readonly string[]>;

/**
 * Who chose a code-worded type, beside its How (F-R4-18): Gemini's pick from
 * the app's list, the app, or you. A v4 pick (`choice`, roadmap-ui-model
 * geminiChoiceOf: one of its stage's options) reads GEMINI_CHOICE_WORDS.
 */
export function catalogProvenanceWords(slot: "PRACTICE" | "STEP" | "CHECKPOINT", by: "GEMINI" | "APP" | "YOU", choice = false): string {
  const what = slot === "PRACTICE" ? "practice type" : slot === "STEP" ? "step type" : "checkpoint type";
  if (by === "GEMINI") return choice ? GEMINI_CHOICE_WORDS : `${what} picked by Gemini from the app's list`;
  if (by === "APP") return "added by the app";
  return "you chose this";
}

// ─── The practice progression, as the plan shows it (contracts §20) ───

/** Gemini's pick on a v4 plan: its choice among the stage's options (the chip on the row). */
export const GEMINI_CHOICE_WORDS = "Gemini's choice among the app's options";

/**
 * Gemini's practice choices accept waits on (R4's DECIDE_PRACTICE_PICKS), in
 * the plan-level card that decides those on outline cards: one line and two
 * short answers (R4's confirmSessionPicks KEEP, or the app's defaults).
 */
export function choicesWaitingLine(n: number): string {
  return `Gemini chose ${plural(n, "practice")} beside the app's ${n === 1 ? "default" : "defaults"}.`;
}
export function keepChoicesWord(n: number): string {
  return n === 1 ? "Keep it" : "Keep them";
}
export function appDefaultsWord(n: number): string {
  return n === 1 ? "Use the app's default" : "Use the app's defaults";
}
/** The footer's name for that card ("1 left: Gemini's practice choices. Then Accept."). */
export const CHOICES_PLAN_LEVEL = "Gemini's practice choices";
/** A Gemini reorder of the outline, put back to yours in one tap (the arrangement line's button). */
export const KEEP_MY_ORDER_WORD = "Keep my order";
/** A stage of a plan you wrote yourself: code's own practice for it, in one tap (roadmap-ui-model appPracticeOf). */
export const APP_PRACTICE_WORD = "Add the app's practice";
/**
 * Under a practice that takes turns with another, week about (roadmap-ui-model
 * practiceTurnOf; contracts §20.12): its label already names both weeks, so
 * this says only why, the lead's ruling 1 (alternate rather than dilute).
 */
export const PRACTICE_TURN_LINE = "Week about, so neither gets cut to one session a week.";

/**
 * The line under Gemini's choice: how many options the stage offered and the
 * app's default. "4 options for this stage; the app's default is Problem
 * sets." / "… this is the app's default too." / "The app's only option for
 * this stage."
 */
export function geminiChoiceLine(c: { options: readonly CatalogKey[]; isDefault: boolean }): string {
  const n = c.options.length;
  if (n <= 1) return "The app's only option for this stage.";
  if (c.isDefault) return `${n} options for this stage; this is the app's default too.`;
  return `${n} options for this stage; the app's default is ${KIND_NAME[c.options[0]] ?? c.options[0]}.`;
}

/**
 * What a stage's practice is for, by how demanding its focus is on the track
 * (roadmap-catalog PROGRESSION's rungs: 1 taking in, 2 retrieving and
 * drilling the parts, 3 producing, 4 putting it together). Code's words only.
 * A routine (CARE, DUTY) holds rather than climbs; timed practice is never a
 * focus, so no line names its rung.
 */
export const STAGE_WHY_WORD: Readonly<Record<CatalogTrack, Readonly<Partial<Record<1 | 2 | 3 | 4, string>>>>> = {
  FIELD: { 1: "Take it in first", 2: "Recall first", 3: "Put it to use", 4: "Put it together" },
  BODY: { 1: "Build the base", 2: "Work on technique", 3: "Build up", 4: "Push harder" },
  CRAFT: { 1: "Technique first", 2: "Drill the hard parts slowly", 3: "Put it together" },
  CARE: { 1: "Plan it first", 2: "Make it a routine" },
  DUTY: { 1: "Plan it first", 2: "Make it a routine" },
};
/** A Field plan's slow drills drill the parts rather than recall them. */
const FIELD_SLOW_DRILLS_WHY = "Drill the parts first";

/** What closes a stage, when it is one of the plan's ends (roadmap-ui-model stageWhysOf reads it from the stage's rows). */
export type StageEnd = "EXAM_DAY" | "MOCK_TEST" | "FULL_ATTEMPT" | "PERFORMANCE_CHECK";

/** What closes a stage, as the end of its why line. */
export const STAGE_END_WORD: Readonly<Record<StageEnd, string>> = {
  EXAM_DAY: "your exam in this stage",
  MOCK_TEST: "mock test at the end",
  FULL_ATTEMPT: "full attempt at the end",
  PERFORMANCE_CHECK: "performance check at the end",
};

/**
 * A stage's "why this stage" line, in parts (the first is shown bold):
 * what its focus is for, what it builds on from the stage before, and what
 * closes it. "Put it to use" · "builds on Recall drills from milestone 2" ·
 * "full attempt at the end". [] when there is nothing to say (no practice,
 * no end).
 */
export function stageWhyPartsOf(w: { focus: CatalogKey | null; rung: number | null; carry: { kind: CatalogKey; ord: number; same: boolean } | null; end: StageEnd | null }, track: CatalogTrack): string[] {
  const parts: string[] = [];
  const word = w.focus === "SLOW_DRILLS" && track === "FIELD" ? FIELD_SLOW_DRILLS_WHY : w.rung != null ? STAGE_WHY_WORD[track][w.rung as 1 | 2 | 3 | 4] : undefined;
  if (word) parts.push(word);
  if (w.carry) parts.push(w.carry.same ? `goes on from milestone ${w.carry.ord}` : `builds on ${KIND_NAME[w.carry.kind] ?? w.carry.kind} from milestone ${w.carry.ord}`);
  if (w.end) parts.push(STAGE_END_WORD[w.end]);
  if (parts.length > 0) parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts;
}

/** The why line as one string ("Put it to use · builds on Recall drills from milestone 2"); null with nothing to say. */
export function stageWhyLine(w: Parameters<typeof stageWhyPartsOf>[0], track: CatalogTrack): string | null {
  const parts = stageWhyPartsOf(w, track);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "Left out because of your constraints: Harder session ('running'), Strength session ('lifting')." */
export function exclusionsLine(xs: readonly ConstraintExclusion[]): string | null {
  if (xs.length === 0) return null;
  return `Left out because of your constraints: ${xs.map((x) => `${KIND_NAME[x.kind] ?? x.kind} ('${x.word}')`).join(", ")}.`;
}

/**
 * The aim meets the user's own constraint (the lead's decision 6): it quotes
 * the sentence they wrote, never a "no X" built from it. "You wrote: “Shin
 * splints flare up if I run more than twice a week”. Your aim is “Run a
 * sub-50 10K”." Then, with the activity card (`gated`), where to answer it;
 * without it (an older draft), "If they don't fit together, change one of
 * them." Null with no sentence to quote. Shown only while unresolved
 * (roadmap-ui-model aimConflictShownOf).
 */
export function aimConflictLine(sentence: string, aim: string, gated = true): string | null {
  const s = sentence.trim();
  if (!s) return null;
  const tail = gated ? `Say in “${ACTIVITY_CARD_NAME}” which sessions the plan should leave out.` : "If they don't fit together, change one of them.";
  return `You wrote: “${s.replace(/[.!?;:,]+$/u, "")}”. Your aim is “${aim.trim().replace(/[.!?;:,]+$/u, "")}”. ${tail}`;
}

/** The one session-picks confirm (F-R4-17): "Gemini picked Harder session and Strength session. Your constraints say '…'. Keep them?" */
export function sessionPicksLine(p: Pick<SessionPicks, "kinds" | "constraints">): string {
  return `Gemini picked ${andList(p.kinds.map((k) => KIND_NAME[k] ?? k))}. Your constraints say '${p.constraints}'. Keep them?`;
}
export const SESSION_PICKS_KEEP = "Keep them";
/** A body plan's swap (sessionPicksSwapWord over BODY's safe practices); a care plan's names its own two. */
export const SESSION_PICKS_EASY = "Use easy, mobility and technique instead";

/**
 * The kinds the swap places, named (the server's swap: the track's safe
 * practices, roadmap-catalog cueSafeKindsOf, less any the user said to
 * avoid): the session words on a body plan ("easy, mobility and technique",
 * `sessions`), the types' own names otherwise ("Plan the week ahead and Keep
 * a log"). Null when none is left.
 */
function swapNamesOf(kinds: readonly CatalogKey[]): { names: string; sessions: boolean } | null {
  if (kinds.length === 0) return null;
  const sessions = kinds.every((k) => SESSION_WORD_KINDS.includes(k));
  return { names: andList(kinds.map((k) => (sessions ? SAFE_KIND_WORD[k] : null) ?? KIND_NAME[k] ?? k)), sessions };
}

/** The swap's button, per track: "Use easy, mobility and technique instead" (body), "Use Plan the week ahead and Keep a log instead" (care); "Leave them out" when the user avoided every one. */
export function sessionPicksSwapWord(kinds: readonly CatalogKey[]): string {
  const s = swapNamesOf(kinds);
  return s ? `Use ${s.names} instead` : "Leave them out";
}

/**
 * The line under the picks, per track and true whatever the card's answer
 * (the swap removes Gemini's picks and puts the track's own practices in the
 * picked practices' place; it never says what the rest of the plan holds):
 * "Nothing reaches Today before you answer. Without Gemini's picks, Plan the
 * week ahead and Keep a log take their place."
 */
export function sessionPicksSwapLine(kinds: readonly CatalogKey[]): string {
  const s = swapNamesOf(kinds);
  const one = kinds.length === 1;
  const tail = s ? `${s.names}${s.sessions ? (one ? " session" : " sessions") : ""} ${one ? "takes" : "take"} their place` : "nothing takes their place";
  return `Nothing reaches Today before you answer. Without Gemini's picks, ${tail}.`;
}

/** The start of R4's accept refusal while Gemini's session picks wait (roadmap-server CONFIRM_PICKS). */
export const SESSION_PICKS_FIRST_LEAD = "Confirm Gemini's session picks first:";
/** The start of R4's refusal of a choice that is neither (confirmSessionPicksCore). */
export const SESSION_PICKS_CHOICE_LEAD = "Keep the picks, or ";

/**
 * Accept's refusal while the picks wait, in the card's own words for this
 * track (the swap's button, sessionPicksSwapWord): "Confirm Gemini's session
 * picks first: keep them, or use Plan the week ahead and Keep a log
 * instead." on a care plan, "… or use easy, mobility and technique instead."
 * on a body plan, "… or leave them out." when the user avoided every one.
 */
export function sessionPicksFirstLine(kinds: readonly CatalogKey[]): string {
  return `${SESSION_PICKS_FIRST_LEAD} ${sessionPicksChoiceLine(kinds).replace(/^K/u, "k")}`;
}

/** The two choices in the card's words for this track: "Keep them, or use Plan the week ahead and Keep a log instead." */
export function sessionPicksChoiceLine(kinds: readonly CatalogKey[]): string {
  const w = sessionPicksSwapWord(kinds);
  return `Keep them, or ${w.charAt(0).toLowerCase()}${w.slice(1)}.`;
}

/**
 * The server's session-picks refusals in this plan's words (R4's
 * CONFIRM_PICKS and its choice refusal name a body plan's sessions on every
 * track; the card names the track's own): a message that starts with either
 * has that first sentence replaced (sessionPicksFirstLine, or
 * sessionPicksChoiceLine for the choice refusal), the card's pointer or
 * anything else after it kept. Any other message is returned as it is.
 */
export function sessionPicksRefusalOf(message: string, kinds: readonly CatalogKey[]): string {
  const first = message.startsWith(SESSION_PICKS_FIRST_LEAD);
  if (!first && !message.startsWith(SESSION_PICKS_CHOICE_LEAD)) return message;
  const line = first ? sessionPicksFirstLine(kinds) : sessionPicksChoiceLine(kinds);
  const end = message.search(/[.!?](?:\s|$)/u);
  const rest = end < 0 ? "" : message.slice(end + 1).replace(/^\s+/u, "");
  return rest ? `${line} ${rest}` : line;
}

/** Gemini's Domain additions (F-R4-21): "Gemini suggests adding 2 of your Domains: Risk Management (14 cards · 3 at level 6+), Calculus (30 cards). Each would count at every milestone, at 25 and 30 cards." */
export function additionsLine(adds: readonly Pick<DomainAddition, "name" | "cards" | "atSix" | "n">[]): string {
  const each = adds.map((a) => `${a.name} (${plural(a.cards, "card")}${a.atSix > 0 ? ` · ${a.atSix} at level 6+` : ""})`).join(", ");
  const head = adds.length === 1 ? "Gemini suggests adding 1 of your Domains" : `Gemini suggests adding ${adds.length} of your Domains`;
  const counts = andList(adds.map((a) => count(a.n)));
  return `${head}: ${each}. ${adds.length === 1 ? "It would count" : "Each would count"} at every milestone, at ${counts} cards.`;
}

/** "Adding both moves the realistic date by about 4 months, to Sun 6 Feb 2028." */
export function additionEffectLine(names: readonly string[], from: DayKey | null, to: DayKey | null): string | null {
  if (!to) return null;
  const who = names.length === 2 ? "Adding both" : names.length > 2 ? `Adding all ${names.length}` : `Adding ${names[0] ?? "it"}`;
  if (!from || to <= from) return `${who} keeps the realistic date at ${dayFull(to)}.`;
  const days = daysBetween(from, to);
  const weeks = Math.max(1, Math.round(days / 7));
  const by = days >= 56 ? `about ${Math.round(days / 30.4)} months` : `about ${plural(weeks, "week")}`;
  return `${who} moves the realistic date by ${by}, to ${dayFull(to)}.`;
}

/** A blocked addition: past 3 years at this depth, or past the plan's Domain cap. */
export function additionBlockedLine(name: string, why: "PAST_SPAN" | "TOO_MANY_DOMAINS"): string {
  return why === "PAST_SPAN" ? `Adding ${name} would take the plan past 3 years at this depth.` : `Adding ${name} would pass the ${DEPTH_DOMAINS_MAX} Domains a plan holds.`;
}

/** [Add both] / [Add all 3] (an English, non-exam aim only). */
export function addAllWord(n: number): string {
  return n === 2 ? "Add both" : `Add all ${n}`;
}
export const CHOOSE_WORD = "Choose…";
export const LEAVE_OUT_WORD = "Leave out";
export const CONFIRM_WORD = "Confirm";

/**
 * The empty outline state (F-R4-24). The Gemini sentence only where Gemini
 * is named (its path live with a key, or a draft Gemini arranged): with
 * Gemini off no Gemini sentence appears anywhere (Acceptance).
 */
export const OUTLINE_EMPTY_LINE = "What to learn comes from your outline.";
export const OUTLINE_EMPTY_GEMINI_TAIL = "Gemini doesn't write topics: it would be guessing.";
export function outlineEmptyLine(gemini: boolean): string {
  return gemini ? `${OUTLINE_EMPTY_LINE} ${OUTLINE_EMPTY_GEMINI_TAIL}` : OUTLINE_EMPTY_LINE;
}
export const OUTLINE_EMPTY_EXAM_LINE = "Paste the official syllabus so every line has a place in the plan.";
export const ADD_OUTLINE_WORD = "Add your outline";

// ─── Legacy plans (F-R4-16) ───

export const LEGACY_DRAFT_BANNER = "This draft was made before plans aimed at a depth.";
export const LEGACY_ACTIVE_BANNER = "Planned before plans aimed at a depth.";
export const LEGACY_GEMINI_HIDDEN = "Wording from an earlier Gemini draft is hidden.";
export const LEGACY_MEASURE_LINE = "Start again at a depth to measure this aim.";
export const DRAFT_IT_AGAIN_WORD = "Draft it again";
export const START_AGAIN_AT_DEPTH_WORD = "Start again at a depth";

// ─── Area suggestions (F-R4-19; only while ROADMAP_GAPS_LIVE) ───

export const GAPS_EYEBROW = "Gemini's pick of your words · not checked";
export const GAPS_TITLE = "Areas Gemini thinks may need their own Domain";
export const GAPS_LINE = "Each name is a phrase from your aim, outline, exam or Domains. Whether it needs its own Domain is Gemini's guess, and the app can't check it. Create one only if you know it does.";
export const GAP_CREATE_WORD = "Create as a Domain…";
export const GAP_DISMISS_WORD = "Dismiss";

/** "Gemini suggested 3 names the app couldn't find in your words; they're not shown." */
export function gapsHiddenLine(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "Gemini suggested 1 name the app couldn't find in your words; it's not shown." : `Gemini suggested ${n} names the app couldn't find in your words; they're not shown.`;
}

const GROUND_WORDS: Readonly<Record<GroundSourceKind, string>> = {
  AIM: "from your aim",
  CONSTRAINTS: "from your constraints",
  EXAM: "from your exam's name",
  OUTLINE: "from your outline line",
  AREA: "from your Area's name",
  DOMAIN: "from your Domain",
  NAMED: "from an area you named",
};

/** "from your outline line S4" */
export function gapSourceLine(src: { kind: GroundSourceKind; index: number }): string {
  return src.kind === "OUTLINE" ? `${GROUND_WORDS.OUTLINE} S${src.index + 1}` : GROUND_WORDS[src.kind];
}

/** "similar to your Domain Statistics" */
export function gapSimilarLine(name: string): string {
  return `similar to your Domain ${name}`;
}

/** The second confirm for an edited, ungrounded name. */
export function gapUngroundedConfirm(name: string): string {
  return `Create a Domain named “${name}”? The app found these words nowhere in your aim, outline, exam or chosen Domains.`;
}

/// ─── Constraint safety: confirm to unlock (contracts §19) ───
//
// The activity card's words. They quote the user's own sentences and name the
// app's session types; they never read a cue as a diagnosis, never call a
// session safe or unsafe, and keep HEALTH_LINE beside them on a body or care
// plan (and a craft plan that asks). The class of a cue (injury, pain …) is
// never shown. Answering is an explicit act: ticks and Save, or "Nothing to
// avoid" (ACTIVITY_NOTHING_TO_AVOID); an unticked row is never called "fine"
// (the lead's decision 1), and no line says the user said so.

/** The card's question (the lead's words), after the quoted words. */
export const ACTIVITY_QUESTION = "Which activities should the plan avoid?";
/** Some of the user's words couldn't be read here (CueReading.unparseable): the plan asks rather than guess. */
export const ACTIVITY_UNREAD_LINE = "Some of your words couldn't be read here, so the plan asks.";
/**
 * How the list answers (the draft review, the roadmap page and the Start
 * sheet): two explicit acts, never a Save with nothing ticked. The release is
 * the card's (the lead's ruling 1): a Save with a box ticked answers every
 * type the card lists, so the line says so, and "Nothing to avoid" is offered
 * only while no box is ticked.
 */
export const ACTIVITY_HOW_LINE = `Tick what the plan should avoid and save: your answer covers every type listed. With nothing ticked, choose “${ACTIVITY_NOTHING_TO_AVOID}”. You can change this later on the roadmap page.`;
/** The intake's version: the answer is saved with the plan. */
export const ACTIVITY_INTAKE_HOW_LINE = `Tick what the plan should avoid and confirm: your answer covers every type listed. With nothing ticked, choose “${ACTIVITY_NOTHING_TO_AVOID}”. Your answer is saved with the plan.`;
export const ACTIVITY_SAVE_WORD = "Save my answers";
export const ACTIVITY_CONFIRM_WORD = "Confirm these";
export const ACTIVITY_CHANGE_WORD = "Change";
/** The save's toast. */
export const ACTIVITY_SAVED_LINE = "The plan follows what you said. You can change it on the roadmap page.";
/** The save's toast on an ACTIVE plan whose unstarted milestones the answers change (R4's ActivityVerdictsResult.replan). */
export const ACTIVITY_REPLAN_LINE = "They change milestones you haven't started. Re-plan to apply them; started ones keep their history.";
/** The intake once the user confirmed (saved after the intake, before the plan is built). */
export const ACTIVITY_CONFIRMED_LINE = "Confirmed. Your answer is saved with the plan.";
/** The intake, when the answer couldn't be saved (refused, or the words changed meanwhile): the draft asks again. */
export const ACTIVITY_NOT_SAVED_LINE = "Your answer about activities wasn't saved. The draft asks again; until then the plan keeps to the sessions it lists.";
/** The toast when a started practice the user now avoids is taken off Today (decision 4: archived through the existing path, history kept; Undo brings it back). */
export const ACTIVITY_PAUSED_TITLE = "Taken off Today";

/** A safe kind's words inside activityPendingLine ("easy, mobility and technique practice only"; "planning the week and keeping a log only"). */
const SAFE_KIND_WORD: Partial<Readonly<Record<CatalogKey, string>>> = {
  EASY_SESSION: "easy",
  MOBILITY_SESSION: "mobility",
  TECHNIQUE_SESSION: "technique",
  PLAN_AHEAD: "planning the week",
  KEEP_A_LOG: "keeping a log",
};
/** The session words that read as "… practice" together. */
const SESSION_WORD_KINDS: readonly CatalogKey[] = ["EASY_SESSION", "MOBILITY_SESSION", "TECHNIQUE_SESSION"];

/** A quoted sentence of the user's: verbatim, its closing full stop left to the line ("…" kept). */
function quoteOf(q: string): string {
  return `“${q.trim().replace(/[.!?;:,]+$/u, "")}”`;
}

/** What a plan of this track adds once the card is answered, for the lead line with nothing to quote. */
const ASKS_BEFORE: Partial<Readonly<Record<string, string>>> = {
  BODY: "harder or longer sessions",
  CARE: "more care sessions",
  CRAFT: "harder practice",
};

/**
 * The card's lead: "Your words mention “Running causes me knee pain”." The
 * quotes are the user's sentences (ActivityConfirmView.quotes), verbatim.
 * With none (a body or care plan asks whatever the words), it claims nothing
 * about the words: "Before the plan adds harder or longer sessions, it asks
 * once." (the lead's handoff, §19.5).
 */
export function activityLeadLine(quotes: readonly string[], track?: string): string {
  const qs = quotes.map((q) => q.trim()).filter(Boolean);
  if (qs.length === 0) return `Before the plan adds ${(track && ASKS_BEFORE[track]) || "more sessions"}, it asks once.`;
  return `Your words mention ${andList(qs.map(quoteOf))}.`;
}

/**
 * What the plan places until the user answers (the lead's words): "Easy,
 * mobility and technique practice only until you confirm." A care plan's:
 * "Planning the week and keeping a log only until you confirm." A craft
 * plan's: "Technique practice only until you confirm."
 */
export function activityPendingLine(safeKinds: readonly CatalogKey[]): string {
  if (safeKinds.length === 0) return "Nothing more is added until you confirm.";
  const words = safeKinds.map((k) => SAFE_KIND_WORD[k] ?? (KIND_NAME[k] ?? k).toLowerCase());
  const sessions = safeKinds.every((k) => SESSION_WORD_KINDS.includes(k));
  const list = `${andList(words)}${sessions ? " practice" : ""}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} only until you confirm.`;
}

/** The card asks again after the words changed (ActivityConfirmView.staleDay): "You answered on 3 Oct, before your words changed." */
export function activityStaleLine(staleDay: DayKey | null | undefined, today?: DayKey): string | null {
  return staleDay ? `You answered on ${dayLabel(staleDay, today)}, before your words changed.` : null;
}

/**
 * One row's line under its name: the user's AVOID and its day, a row the
 * earlier answer left unticked before the words changed, or a suggestion's
 * quote ("From your words: “…”"; its box comes pre-ticked; after a stale
 * answer, both). A row the answer
 * left unticked (FINE) has no line: the user's act was the card's answer,
 * never "fine" for that row.
 */
export function activityRowLine(row: Pick<ActivityRow, "state" | "prefill" | "reason" | "day" | "staleDay">, today?: DayKey): string | null {
  if (row.state === "AVOID") return row.day ? `You said to avoid it on ${dayLabel(row.day, today)}` : "You said to avoid it";
  if (row.state === "FINE") return null;
  const from = row.reason.trim() ? `From your words: ${quoteOf(row.reason)}` : null;
  if (row.staleDay) return `Not ticked on ${dayLabel(row.staleDay, today)}, before your words changed${from && row.prefill === "AVOID" ? `. ${from}` : ""}`;
  if (row.state === "WORDS" || row.prefill === "AVOID") return from;
  return null;
}

/** "Easy session (3 Oct)" when the days differ, the day once at the end when they don't. */
function namesWithDays(rows: readonly Pick<ActivityRow, "kind" | "day">[], today?: DayKey): string {
  const days = new Set(rows.map((r) => r.day ?? ""));
  if (days.size === 1) {
    const d = rows[0]?.day;
    return `${andList(rows.map((r) => KIND_NAME[r.kind] ?? r.kind))}${d ? ` (${dayLabel(d, today)})` : ""}`;
  }
  return andList(rows.map((r) => `${KIND_NAME[r.kind] ?? r.kind}${r.day ? ` (${dayLabel(r.day, today)})` : ""}`));
}

/**
 * The answered card's summary (nothing to ask), naming the user's answer and
 * never a "fine" they didn't say: "You said to avoid: Strength session (5
 * Oct)." or "You said there's nothing to avoid (5 Oct).", then what the plan
 * may now include ("The plan can include: Harder session and Longer
 * session."), and an unanswered suggestion ("Ticked from your words, still in
 * the plan until you answer: Timed practice."). Empty when no row is shown.
 */
export function activitySummaryLines(
  view: { rows: readonly Pick<ActivityRow, "kind" | "state" | "reason" | "day">[]; answered?: DayKey | null; none?: boolean },
  today?: DayKey
): string[] {
  const out: string[] = [];
  const avoid = view.rows.filter((r) => r.state === "AVOID");
  const fine = view.rows.filter((r) => r.state === "FINE");
  const words = view.rows.filter((r) => r.state === "WORDS");
  const on = view.answered ? ` (${dayLabel(view.answered, today)})` : "";
  if (avoid.length > 0) out.push(`You said to avoid: ${namesWithDays(avoid, today)}.`);
  if (view.none) out.push(avoid.length > 0 ? `You said there's nothing else to avoid${on}.` : `You said there's nothing to avoid${on}.`);
  if (fine.length > 0) out.push(`The plan can include: ${andList(fine.map((r) => KIND_NAME[r.kind] ?? r.kind))}.`);
  if (words.length > 0) {
    const line = activitySuggestedLine(words.map((r) => (r.reason.trim() ? `${KIND_NAME[r.kind] ?? r.kind} (${quoteOf(r.reason)})` : (KIND_NAME[r.kind] ?? r.kind))));
    if (line) out.push(line);
  }
  return out;
}

/** The suggestions the user hasn't answered: ticked from their words, but nothing is left out until they save (the lead's decision 7). */
export function activitySuggestedLine(names: readonly string[]): string | null {
  return names.length > 0 ? `Ticked from your words, still in the plan until you answer: ${names.join(", ")}.` : null;
}

/**
 * What the card's button does now, beside it (the act is explicit: the user
 * sees what Save leaves out and what the plan may then include). With
 * nothing ticked the button is "Nothing to avoid".
 */
export function activitySaveLine(ticked: number, listed: number): string {
  const n = Math.max(0, listed);
  const t = Math.max(0, Math.min(ticked, n));
  if (n === 0) return "";
  if (t === 0) return n === 1 ? "The plan can then include it." : `The plan can then include all ${n}.`;
  if (t === n) return n === 1 ? "The plan leaves it out." : `The plan leaves out all ${n}.`;
  return `The plan leaves out ${t} and can include the other ${n - t === 1 ? "one" : n - t}.`;
}

/** The Start sheet: the milestone's practices the answer holds back ("Waiting on your answer, not added to Today: Harder session."). */
export function activityWaitingLine(names: readonly string[]): string | null {
  return names.length > 0 ? `Waiting on your answer, not added to Today: ${andList(names)}.` : null;
}

/** The Start sheet: the milestone's practices the user said to avoid (a suggestion never leaves one out). */
export function activityLeftOutLine(names: readonly string[]): string | null {
  return names.length > 0 ? `You said to avoid, not added to Today: ${andList(names)}.` : null;
}

/** A Start sheet practice the answer holds back, in place of its switch. */
export const ACTIVITY_HELD_WAITING = "Waiting on your answer about activities: not added to Today.";
export const ACTIVITY_HELD_LEFT_OUT = "You said to avoid it: not added to Today.";

/** The type picker while kinds wait on the answer. */
export function activityPickerLine(names: readonly string[]): string | null {
  return names.length > 0 ? `Not offered until you answer “${ACTIVITY_CARD_NAME}”: ${andList(names)}.` : null;
}

/** The toast's body when started practices the user now avoids are taken off Today (decision 4). */
export function activityPausedLine(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return `You said to avoid ${names.length === 1 ? "it" : "them"}, so ${andList(names)} ${names.length === 1 ? "is" : "are"} off Today. History is kept; Undo brings ${names.length === 1 ? "it" : "them"} back.`;
}

/**
 * A started practice or step an answer took off Today (decision 4), on its
 * row of the roadmap page in place of its On Today link, for as long as the
 * user's AVOID stands: never a silent change. A practice whose Practice kept
 * no longer pays also says so (the lead's ruling 3): "Paused on 5 Oct
 * because you said to avoid it. From that day it no longer counts toward
 * this milestone."
 */
export function pausedItemLine(day: DayKey, offTarget: boolean, today?: DayKey): string {
  const head = `Paused on ${dayLabel(day, today)} because you said to avoid it.`;
  return offTarget ? `${head} From that day it no longer counts toward this milestone.` : head;
}

/** How a started item stands after an answer touched it (roadmap-ui-model PausedItem: its PauseState, the AVOID's day, its Practice kept, its task). */
export interface PauseRowState {
  state: "PAUSED" | "NOT_PAUSED" | "UNDONE" | "LIFTED";
  day: DayKey | null;
  offTarget: boolean;
  offToday?: boolean;
}

/** A LIFTED practice's count line (no AVOID stands; R4 never turns its Practice kept back to paying). */
const LIFTED_COUNT_LINE = "It stopped counting toward this milestone when you said to avoid it, and changing your answer doesn't make it count again.";

/**
 * The line on a started practice's or step's row once an answer touched it
 * (the lead's ruling 3: never a silent change), true in every state:
 *   - PAUSED: "Paused on 5 Oct because you said to avoid it." (pausedItemLine;
 *     the row shows no On Today link);
 *   - NOT_PAUSED (R4's `notPaused`): "You said to avoid it on 5 Oct, but it
 *     couldn't be taken off Today: that change didn't go through, so it's
 *     still there. Archive it from Today if you want it off.";
 *   - UNDONE: "Back on Today: you chose Undo after saying to avoid it on 5 Oct.";
 *   - LIFTED: "It stopped counting toward this milestone when you said to
 *     avoid it, and changing your answer doesn't make it count again.", led
 *     by "Still off Today since you said to avoid it." when the page saw it
 *     paused.
 * With its Practice kept no longer paying, the AVOID states add that from
 * that day it no longer counts toward this milestone.
 */
export function pauseRowLine(p: PauseRowState, today?: DayKey): string {
  if (p.state === "LIFTED" || !p.day) return p.offToday ? `Still off Today since you said to avoid it. ${LIFTED_COUNT_LINE}` : LIFTED_COUNT_LINE;
  if (p.state === "PAUSED") return pausedItemLine(p.day, p.offTarget, today);
  const d = dayLabel(p.day, today);
  const count = p.offTarget ? ` From ${d} it no longer counts toward this milestone.` : "";
  if (p.state === "NOT_PAUSED") return `You said to avoid it on ${d}, but it couldn't be taken off Today: that change didn't go through, so it's still there. Archive it from Today if you want it off.${count}`;
  return `Back on Today: you chose Undo after saying to avoid it on ${d}.${count}`;
}

/**
 * Under a Practice kept measure that no longer pays (the lead's ruling 3;
 * R4 turns it CONTEXT from the day the last of its practices was paused),
 * true whatever happened to the tasks since:
 *   - every one paused: "Strength session is paused because you said to
 *     avoid it, so from 5 Oct this no longer counts toward the milestone.";
 *   - one still on Today (its pause refused) or back by Undo: "You said to
 *     avoid Strength session, so from 5 Oct this no longer counts toward the
 *     milestone.";
 *   - the AVOID lifted (no day): "This stopped counting toward the milestone
 *     when you said to avoid Strength session, and changing your answer
 *     doesn't make it count again."
 * Null with none.
 */
export function practiceKeptPausedLine(rows: readonly { label: string; day: DayKey | null; state?: PauseRowState["state"] }[], today?: DayKey): string | null {
  if (rows.length === 0) return null;
  const one = rows.length === 1;
  const names = andList(rows.map((r) => r.label));
  const days = rows.map((r) => r.day);
  if (days.some((d) => !d)) return `This stopped counting toward the milestone when you said to avoid ${names}, and changing your answer doesn't make it count again.`;
  const last = (days as DayKey[]).reduce((a, b) => (b > a ? b : a));
  if (rows.some((r) => r.state != null && r.state !== "PAUSED")) return `You said to avoid ${names}, so from ${dayLabel(last, today)} this no longer counts toward the milestone.`;
  return `${names} ${one ? "is" : "are"} paused because you said to avoid ${one ? "it" : "them"}, so from ${dayLabel(last, today)} this no longer counts toward the milestone.`;
}

/** The toast's title and body when a started practice the user now avoids couldn't be taken off Today (R4's `notPaused`): where to do it. */
export const ACTIVITY_NOT_PAUSED_TITLE = "Still on Today";
export function activityNotPausedLine(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return `${andList(names)} couldn't be taken off Today here. Archive ${names.length === 1 ? "it" : "them"} from Today if you want ${names.length === 1 ? "it" : "them"} off.`;
}
