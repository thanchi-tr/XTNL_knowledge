/**
 * FROZEN CONTRACT (roadmap lane 0; docs/life-plan/roadmap-rev4.md F-R4-1,
 * F-R4-3, F-R4-4; contracts §14). Inviting the aim: the rules, pure.
 *
 * "Encourage character to specify long term goal": the character page asks
 * for the aim in place, and Today mentions it quietly on fresh-start days
 * (the life week's Monday, the 1st of the month, the first day back after a
 * week away) with a back-off, and at the aim's own pending step. Never
 * through counts, red, the bell, rewards or a model; every "no" is honest:
 * "Not now" is AIM_LATER_DAYS, the lasting no is LifeSettings.aimSuggestions
 * (Settings, or "Don't suggest this"), and a legacy 'off' cookie is still a no.
 *
 * Client-importable: no database, no clock read (every rule takes `today`, a
 * life-day key, so 02:00 on a Monday is still Sunday), no model. R4's
 * loaders and actions, R5's AimCard and AimLine, T's Today page and Y's /you
 * and Settings pages read these; roadmap-invite-check pins them.
 *
 *   Constants   AIM_LATER_DAYS · AIM_PROMPT_LATER_MAX_AGE_S · AIM_AWAY_DAYS · AIM_BACKOFF_FRESH_DAYS ·
 *               AIM_INVITE_SINCE · AIM_DRAFT_SHOWS_MAX · AIM_START_DAILY_DAYS · AIM_DONE_SHOW_DAYS ·
 *               AIM_STEP_COOKIE · AIM_STEP_SNOOZE_DAYS · AIM_STEP_COOKIE_MAX_AGE_S · VAGUE_AIM_WORDS · VAGUE_AIM_IDLE_MS
 *   The prompt  AimPrompt · aimPromptOf · laterCookieValue · hideCookieValue · onCookieValue · askAnchorOf
 *   The seed    AimSeed · longGoalSeedOf
 *   Today       isFreshStartDay · freshStartDaysBetween · AimStepKind · stepCookieValue · stepSnoozed · todayAimLineOf
 *   The intake  vagueAimHint
 */
import { addDays, daysBetween, weekdayOf, type DayKey } from "./life-day";
import {
  AIM_MAX,
  AIM_PROMPT_COOKIE,
  CREDENTIAL_WORDS,
  ENGLISH_FUNCTION_WORDS,
  SPAN_MAX_DAYS,
  SPAN_MIN_DAYS,
  aimRankName,
  stageLabelOf,
  type AimLineView,
  type AimStep,
  type AimStepMilestone,
} from "./roadmap-types";
import type { GoalLadder, GoalLadderItem } from "./goals";

export { AIM_PROMPT_COOKIE };

// ═══ Constants (policy, published on /today/rules) ══════════════════════════

/** "Not now" quiets every set-an-aim suggestion this many life days, on /you and Today alike. */
export const AIM_LATER_DAYS = 28;
/** The 'later:<day>' and 'on:<day>' cookie's lifetime: it outlives the snooze, because its day anchors the back-off. */
export const AIM_PROMPT_LATER_MAX_AGE_S = 365 * 24 * 60 * 60;
/** A first life day back after more than this many days with no DAY_OPEN row is a fresh-start day. */
export const AIM_AWAY_DAYS = 7;
/** After this many fresh-start days of an ignored ask, Today's SET line shows only on the 1st of the month. */
export const AIM_BACKOFF_FRESH_DAYS = 4;
/**
 * The deploy day of revision 4, a floor for the back-off's anchor, so the
 * back-off doesn't start already spent (fix round 2, contracts §16.5): Tue 6
 * Oct 2026, the first life day after the revision-4 fix rounds and the
 * earliest the gated push can deploy. The next fresh-start day after it is
 * Mon 12 Oct, so a deploy on any day up to Sun 11 Oct leaves all
 * AIM_BACKOFF_FRESH_DAYS asks for after the deploy. LEAD: if the deploy lands
 * later, set this to the deploy day (a Monday or a 1st between this day and
 * the deploy would count as an ask nobody saw); a later value only delays
 * the back-off. roadmap-invite-check pins the value and the four asks.
 */
export const AIM_INVITE_SINCE: DayKey = "2026-10-06";
/** A waiting draft shows on Today on this many days in all: the day after its last save, then fresh-start days. */
export const AIM_DRAFT_SHOWS_MAX = 3;
/** A milestone ready to start shows daily this many days, then on fresh-start days. */
export const AIM_START_DAILY_DAYS = 7;
/** A DONE roadmap leads the Aim card, and Today's SET reads "Your last aim is done", this many days after it ended. */
export const AIM_DONE_SHOW_DAYS = 28;
/** The cookie that hides one DRAFT or START line ('<kind>:<id>:<day>'). */
export const AIM_STEP_COOKIE = "xtnl-aim-step";
/** "Not now: hide this for a week" on a DRAFT or START line. */
export const AIM_STEP_SNOOZE_DAYS = 7;
export const AIM_STEP_COOKIE_MAX_AGE_S = 8 * 24 * 60 * 60;
/** Verbs that say nothing about what the user will be able to do (vagueAimHint), longest matched first. */
export const VAGUE_AIM_WORDS: readonly string[] = ["get better", "improve", "learn more", "be good at", "understand", "know more", "get into", "learn"];
/** The intake's vague-aim hint appears after this much idle typing (ms). */
export const VAGUE_AIM_IDLE_MS = 600;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day key (rejects "2027-02-30"). */
function isDayKey(s: string): s is DayKey {
  if (!DAY.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const maxDay = (days: readonly (DayKey | null | undefined)[]): DayKey | null => {
  let best: DayKey | null = null;
  for (const d of days) if (d && (best === null || d > best)) best = d;
  return best;
};

// ═══ The prompt (F-R4-1, F-R4-5) ════════════════════════════════════════════

/**
 * The empty Aim card's state: ASK (the full card), LATER (the 56 px line),
 * HIDDEN (fix round: "Not now" on the LATER line — no suggestion on /you or
 * Today until AIM_LATER_DAYS pass; suggestions are still on, so Settings
 * shows the switch on), OFF (the lasting no: nothing).
 * A surface renders HIDDEN as it renders OFF, except that a last aim's
 * achievement line (no link to a new aim, no ×) may still show (F-R4-2).
 */
export type AimPrompt = "ASK" | "LATER" | "HIDDEN" | "OFF";

const LATER = /^later:(\d{4}-\d{2}-\d{2})$/;
const HIDE = /^hide:(\d{4}-\d{2}-\d{2})$/;
const ON = /^on:(\d{4}-\d{2}-\d{2})$/;

/**
 * The prompt from the cookie (AIM_PROMPT_COOKIE) and the stored setting
 * (LifeSettings.aimSuggestions):
 *   setting false → OFF (the stored, lasting no);
 *   'off' → OFF (rev 3's value keeps its meaning until the switch is turned on, which deletes it);
 *   'later:<day>' while today < day + AIM_LATER_DAYS → LATER;
 *   'hide:<day>' while today < day + AIM_LATER_DAYS → HIDDEN (fix round: the
 *     LATER line's × "Not now: no aim suggestions for 4 weeks" now does what it says);
 *   anything else (absent, malformed, expired, 'on:<day>') → ASK.
 */
export function aimPromptOf(cookie: string | null | undefined, setting: boolean | null | undefined, today: DayKey): AimPrompt {
  if (setting === false) return "OFF";
  if (cookie === "off") return "OFF";
  const m = typeof cookie === "string" ? LATER.exec(cookie) : null;
  if (m && isDayKey(m[1]) && today < addDays(m[1], AIM_LATER_DAYS)) return "LATER";
  const h = typeof cookie === "string" ? HIDE.exec(cookie) : null;
  if (h && isDayKey(h[1]) && today < addDays(h[1], AIM_LATER_DAYS)) return "HIDDEN";
  return "ASK";
}

/** "Not now" on the ASK card: the cookie value 'later:<today>' (maxAge AIM_PROMPT_LATER_MAX_AGE_S). */
export function laterCookieValue(today: DayKey): string {
  return `later:${today}`;
}

/**
 * "Not now" on the LATER line (fix round): 'hide:<today>' (the same cookie,
 * maxAge AIM_PROMPT_LATER_MAX_AGE_S, path '/', sameSite lax, httpOnly). For
 * AIM_LATER_DAYS no set-an-aim suggestion shows on /you or Today; then the
 * full card asks again. R4's hideAimPrompt action writes it.
 */
export function hideCookieValue(today: DayKey): string {
  return `hide:${today}`;
}

/** The Settings switch turned back on: 'on:<today>' (the back-off starts again). */
export function onCookieValue(today: DayKey): string {
  return `on:${today}`;
}

/**
 * The day the current ask began, for Today's back-off (F-R4-3): the latest
 * of a 'later:' or 'hide:' day + AIM_LATER_DAYS, an 'on:' day, the latest
 * roadmap's done or archive day, the life epoch day, and AIM_INVITE_SINCE. A
 * "Not now", the switch turned back on, or a closed aim moves it; nothing is
 * counted per view.
 */
export function askAnchorOf(cookie: string | null | undefined, lastClosedDay: DayKey | null | undefined, epochDay: DayKey | null | undefined): DayKey {
  const later = typeof cookie === "string" ? (LATER.exec(cookie) ?? HIDE.exec(cookie)) : null;
  const on = typeof cookie === "string" ? ON.exec(cookie) : null;
  return (
    maxDay([
      AIM_INVITE_SINCE,
      later && isDayKey(later[1]) ? addDays(later[1], AIM_LATER_DAYS) : null,
      on && isDayKey(on[1]) ? on[1] : null,
      lastClosedDay,
      epochDay,
    ]) ?? AIM_INVITE_SINCE
  );
}

// ═══ The seed: a long goal offered as the aim (F-R4-1) ══════════════════════

/** "Start from your long goal “<title>”": its title (clamped to AIM_MAX) and, when it is a fitting aim date, its due day. */
export interface AimSeed {
  goalId: string;
  title: string;
  /** The goal's due day, only when it lies SPAN_MIN_DAYS..SPAN_MAX_DAYS from today. */
  targetDay?: DayKey;
}

/** A goal as the seed reads it: the sheet's ladder item, or anything with its fields (krMetric when known). */
export type SeedGoal = Pick<GoalLadderItem, "id" | "title" | "horizon" | "dueDay"> & { roadmap?: unknown; krMetric?: string | null };

function clampChars(s: string, max: number): string {
  const points = Array.from(s);
  return points.length > max ? points.slice(0, max).join("").trimEnd() : s;
}

/**
 * The long goal to offer as an aim (s.goals, the sheet's goal ladder): open
 * goals with horizon LONG, no roadmap link and a non-empty title; the latest
 * due day wins (a null due day sorts last), ties by title. Null with none.
 */
export function longGoalSeedOf(goals: GoalLadder | readonly SeedGoal[] | null | undefined, today: DayKey): AimSeed | null {
  const list: readonly SeedGoal[] = !goals ? [] : Array.isArray(goals) ? (goals as readonly SeedGoal[]) : (goals as GoalLadder).open;
  const fits = list.filter((g) => g.horizon === "LONG" && g.roadmap == null && g.krMetric !== "ROADMAP" && typeof g.title === "string" && g.title.trim() !== "");
  if (fits.length === 0) return null;
  const sorted = [...fits].sort((a, b) => {
    if (a.dueDay !== b.dueDay) {
      if (a.dueDay == null) return 1;
      if (b.dueDay == null) return -1;
      return a.dueDay > b.dueDay ? -1 : 1;
    }
    const ta = a.title.trim();
    const tb = b.title.trim();
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
  const g = sorted[0];
  const seed: AimSeed = { goalId: g.id, title: clampChars(g.title.trim(), AIM_MAX) };
  if (g.dueDay && isDayKey(g.dueDay)) {
    const span = daysBetween(today, g.dueDay);
    if (span >= SPAN_MIN_DAYS && span <= SPAN_MAX_DAYS) seed.targetDay = g.dueDay;
  }
  return seed;
}

// ═══ Today's aim line (F-R4-3) ══════════════════════════════════════════════

const isFirstOfMonth = (d: DayKey): boolean => d.endsWith("-01");
const isMonday = (d: DayKey): boolean => weekdayOf(d) === 1;

/**
 * A fresh-start day (decision 35): the life week's Monday, the 1st of the
 * month, or the first life day back after more than AIM_AWAY_DAYS with no
 * DAY_OPEN row (daysBetween(lastOpenBefore, today) > AIM_AWAY_DAYS). All
 * read from life-day keys, so 02:00 on a Monday (still Sunday's life day) is not one.
 */
export function isFreshStartDay(today: DayKey, lastOpenBefore: DayKey | null | undefined): boolean {
  if (isMonday(today) || isFirstOfMonth(today)) return true;
  return !!lastOpenBefore && daysBetween(lastOpenBefore, today) > AIM_AWAY_DAYS;
}

/** The fresh-start days in [a, b), by day keys alone (Mondays and 1sts; a Monday the 1st counts once; the away rule counts only today's). */
export function freshStartDaysBetween(a: DayKey, b: DayKey): number {
  let n = 0;
  for (let d = a; d < b; d = addDays(d, 1)) if (isMonday(d) || isFirstOfMonth(d)) n += 1;
  return n;
}

/** The two lines "Not now" can hide for a week. */
export type AimStepKind = "DRAFT" | "START";

/** "Not now" on a DRAFT or START line: AIM_STEP_COOKIE = '<kind>:<roadmapId|milestoneId>:<today>' (maxAge AIM_STEP_COOKIE_MAX_AGE_S). */
export function stepCookieValue(kind: AimStepKind, id: string, today: DayKey): string {
  return `${kind}:${id}:${today}`;
}

const STEP = /^(DRAFT|START):([A-Za-z0-9_-]{1,64}):(\d{4}-\d{2}-\d{2})$/;

/** The line for this kind and id is hidden: the cookie names it, and today is within AIM_STEP_SNOOZE_DAYS of its day. Another id shows. */
export function stepSnoozed(stepCookie: string | null | undefined, kind: AimStepKind, id: string, today: DayKey): boolean {
  const m = typeof stepCookie === "string" ? STEP.exec(stepCookie) : null;
  if (!m || m[1] !== kind || m[2] !== id || !isDayKey(m[3])) return false;
  return today >= m[3] && today < addDays(m[3], AIM_STEP_SNOOZE_DAYS);
}

/** What todayAimLineOf reads. `prompt` is aimPromptOf(cookie, setting, today); `cookie` is AIM_PROMPT_COOKIE's value (the anchor). */
export interface TodayAimLineInput {
  step: AimStep | null;
  prompt: AimPrompt;
  cookie: string | null | undefined;
  stepCookie: string | null | undefined;
  today: DayKey;
  /** ROADMAP_GOALS_LIVE (or a check's override): while false, START never shows. */
  goalsLive: boolean;
}

export const AIM_LINE_SET_HREF = "/you/roadmap/new";
export const AIM_LINE_DRAFT_HREF = "/you/roadmap";
export const AIM_LINE_START_HREF = "/you/roadmap#now";

/** The next milestone START names, its ready day, and the rank it gives; null when none applies. */
function startOf(open: Extract<NonNullable<AimStep["open"]>, { kind: "ACTIVE" }>, today: DayKey): { next: AimStepMilestone; ready: DayKey; givesIndex: number | null } | null {
  const ms = [...open.milestones].sort((a, b) => a.ord - b.ord);
  if (ms.some((m) => m.state === "OPEN")) return null;
  const next = ms.find((m) => m.state === "PLANNED" && !m.held && m.reachedDay == null);
  if (!next) return null;
  if (next.dueDay && next.dueDay < today) return null; // PAST_DUE
  const before = ms.filter((m) => m.ord < next.ord && m.state !== "LATER");
  const prev = before[before.length - 1];
  const prevClose = prev ? (prev.closedDay ?? (prev.held ? prev.reachedDay : null)) : null;
  const base = maxDay([open.acceptedDay, prevClose]) ?? open.acceptedDay;
  const given = ms.reduce((best, m) => (m.reachedDay != null && !m.held && m.rankIndex != null ? Math.max(best, m.rankIndex) : best), 0);
  const givesIndex = next.rankIndex != null && next.rankIndex > given ? next.rankIndex : null;
  return { next, ready: addDays(base, 1), givesIndex };
}

/**
 * Today's one quiet aim line (decisions 35, 49), data only (R5's AimLine
 * renders the copy). At most one applies, by the open roadmap:
 *   none open → SET, when the prompt is ASK, today is a fresh-start day and
 *     the back-off allows it (fewer than AIM_BACKOFF_FRESH_DAYS fresh-start
 *     days in [askAnchorOf(…), today), or today is the 1st). Variant NEXT
 *     (the latest DONE ended within AIM_DONE_SHOW_DAYS), else BACK (the first
 *     day back), else MONTH (the 1st), else WEEK;
 *   a DRAFT (no RUNNING run), saved on day s before today → DRAFT on s + 1,
 *     then on fresh-start days, AIM_DRAFT_SHOWS_MAX days in all;
 *   ACTIVE with goalsLive, no milestone open, the next PLANNED one unreached,
 *     not LATER and not past due, ready (the day after the later of the
 *     acceptance and the previous milestone's close) → START on its first
 *     AIM_START_DAILY_DAYS ready days, then on fresh-start days.
 * The prompt (the Settings switch) silences SET only; DRAFT and START are the
 * user's own pending work, hidden for a week by "Not now" (stepSnoozed).
 */
export function todayAimLineOf(input: TodayAimLineInput): AimLineView | null {
  const { step, prompt, cookie, stepCookie, today, goalsLive } = input;
  if (!step) return null;
  const open = step.open;
  const fresh = isFreshStartDay(today, step.lastOpenBefore);
  if (!open) {
    if (prompt !== "ASK" || !fresh) return null;
    const first = isFirstOfMonth(today);
    if (!first && freshStartDaysBetween(askAnchorOf(cookie, step.lastClosedDay, step.epochDay), today) >= AIM_BACKOFF_FRESH_DAYS) return null;
    const back = !!step.lastOpenBefore && daysBetween(step.lastOpenBefore, today) > AIM_AWAY_DAYS;
    const variant = step.lastDoneDay && daysBetween(step.lastDoneDay, today) < AIM_DONE_SHOW_DAYS ? "NEXT" : back ? "BACK" : first ? "MONTH" : "WEEK";
    return { kind: "SET", variant, href: AIM_LINE_SET_HREF };
  }
  if (open.kind === "DRAFT") {
    if (open.running || today <= open.savedDay) return null;
    if (stepSnoozed(stepCookie, "DRAFT", open.roadmapId, today)) return null;
    const firstShow = addDays(open.savedDay, 1);
    if (today !== firstShow && !fresh) return null;
    const prior = today > firstShow ? 1 + freshStartDaysBetween(addDays(firstShow, 1), today) : 0;
    return prior < AIM_DRAFT_SHOWS_MAX ? { kind: "DRAFT", roadmapId: open.roadmapId, href: AIM_LINE_DRAFT_HREF } : null;
  }
  if (!goalsLive) return null;
  const s = startOf(open, today);
  if (!s || today < s.ready) return null;
  if (!(daysBetween(s.ready, today) < AIM_START_DAILY_DAYS || fresh)) return null;
  if (stepSnoozed(stepCookie, "START", s.next.id, today)) return null;
  return {
    kind: "START",
    milestoneId: s.next.id,
    ord: s.next.ord,
    stageName: open.track ? null : stageLabelOf(s.next.stage, s.next.gateLevel),
    givesRank: s.givesIndex != null ? aimRankName(s.givesIndex) : null,
    href: AIM_LINE_START_HREF,
  };
}

// ═══ The intake: the vague-aim hint (F-R4-4) ════════════════════════════════

const FUNCTION_WORDS = new Set(ENGLISH_FUNCTION_WORDS);
const STANDARD_WORDS = new Set(["level", "grade", "band", "score"]);
const LEAD_IN = /^(?:i\s+want\s+to|i'd\s+like\s+to|i\s+would\s+like\s+to|to)\s+/;
const BY_LENGTH = [...VAGUE_AIM_WORDS].sort((a, b) => b.length - a.length);

/**
 * "Say what you'll be able to do, and how well: something you could show
 * someone." — true when the trimmed aim has fewer than 3 words, or when its
 * only verb is one of VAGUE_AIM_WORDS with no number, standard (an exam word,
 * an acronym, level, grade, band or score) or object of 2 or more content
 * words after it. Never blocks submit, never edits the aim; '' gives none.
 * No model.
 */
export function vagueAimHint(aim: string | null | undefined): boolean {
  const t = (aim ?? "").trim();
  if (!t) return false;
  if (t.split(/\s+/).length < 3) return true;
  const rest = t.toLowerCase().replace(LEAD_IN, "");
  const vague = BY_LENGTH.find((v) => rest === v || rest.startsWith(`${v} `));
  if (!vague) return false;
  const afterLower = rest.slice(vague.length).trim();
  if (/\p{Nd}/u.test(afterLower)) return false;
  // An acronym anywhere (IELTS, CFA) names a standard; the vague verb itself is never one.
  if (/(?<![A-Za-z0-9])[A-Z]{2,6}(?![A-Za-z0-9])/.test(t)) return false;
  const words = afterLower.match(/[\p{L}\p{M}'’-]+/gu) ?? [];
  if (words.some((w) => CREDENTIAL_WORDS.includes(w) || STANDARD_WORDS.has(w))) return false;
  const content = words.filter((w) => !FUNCTION_WORDS.has(w));
  return content.length < 2;
}
