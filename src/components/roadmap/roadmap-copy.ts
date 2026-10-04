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
 *   + the formatting, flag, rank, Proficiency, pace and pay lines below.
 */
import { LIFE_TZ, addDays, dayKeyOf, daysBetween, type DayKey } from "@/lib/life-day";
import { goalPercent, statedPayoutCopy } from "@/lib/goals";
import type { Track } from "@/lib/life-types";
import {
  AIM_RANKS,
  INTENSITY,
  NOT_RECORDED_HERE,
  ROADMAP_DRAFTS_PER_DAY,
  ROADMAP_WRITES_OFF,
  interval,
  type AimCheck,
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

/** How each pack section is named in the privacy line (closed: every PackSection has words). */
export const PACK_SECTION_WORDS: Readonly<Record<PackSection, string>> = {
  aim: "your aim",
  area: "Area name",
  constraints: "constraints",
  exam: "exam name",
  syllabus: "syllabus lines",
  plan: "the plan's milestone count and weeks",
  domains: "your Domain names with their card counts",
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
};

/** A milestone note's line. */
export const MILESTONE_NOTE_LINE: Readonly<Record<MilestoneNote, string>> = {
  NO_STUDY_SLOT: "No study practice added: this milestone already has 3 — swap one for study if you need it.",
  NOT_MEASURABLE: "No measurable part — add a Domain or a practice.",
  CARDS_TOO_SMALL: "The card target was too small to be a milestone, so it was dropped.",
  HEALTH_LINE,
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
