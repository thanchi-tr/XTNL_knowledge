/**
 * Main quests (blueprint 2.1 and 2.2; decisions D11 and D12): one vocabulary, and the main quest and its sprint as
 * Today's side column, the weekly review's Sprint step and the phone's GET /quests read them.
 *
 *   Vocabulary   MAIN_QUEST · MILESTONE · SPRINT · SPRINT_SHORT · PAST_SPRINTS · KEY_RESULTS
 *                SPRINT_FINAL_AT · SPRINT_PROVISIONAL_LINE · SPRINT_SETTLING_LINE · SPRINT_FINAL_LINE
 *   The quest    MainQuest · MainQuestState · mainQuestOf(card, week, today) · mainQuestPickOf(cards)
 *                milestoneUnderWay(card)
 *   The sprint   Sprint · SprintRow · SprintShare · sprintOf(week, today) · sprintShareOf · pastSprintShareOf
 *                sprintCountLine · sprintLine · sprintRowCountLine · sprintWeekLabel · milestoneLineOf · milestoneHeadOf
 *   The review   SprintReview · sprintReviewOf · sprintReviewLine · SprintStep · sprintStepOf · readsPastSprints
 *                SPRINT_STEP_NOTE · SPRINT_HELD_LINE · NO_SPRINT_LINE
 *
 * One vocabulary (D11): the roadmap goal is the "Main quest", its stages are "Milestones", and its week quests are
 * "This week's sprint". The Short, Mid and Long goals stay what they are, the main quest's key results; the daily
 * quests stay the musts, and Today's three stay momentum's. The main quest is the lowest seat whose milestone is under
 * way, else the lowest open seat (mainQuestPickOf over loadAimCards' cards, in seat order), so a draft or a planned
 * goal on seat 1 never hides the sprint seat 2 is running; its sprint is that goal's own set (main-quest-server
 * loadMainQuestWeek). The roadmap is the only milestone system, so nothing here keeps a second one.
 *
 * The sprint's share is never a verdict (D12): the set is frozen just after Monday 04:00, and its results are written
 * once, by the chain, from the Wednesday 04:00 after its Sunday (roadmap-quests-server finalizeQuestWeeks, gated by
 * isQuestWeekFinal). Before that this module only ever says what the live count is: on the week's Sunday, and while
 * it settles, "provisional · final Wed 04:00". It writes nothing and judges nothing.
 *
 * A milestone's title keeps its provenance wherever it is echoed (contracts §22.11): `titleClass` (Gemini's words
 * carry "Gemini suggestion · not checked") and `titleStruck` (a Gemini title's numbers, struck through, never
 * rewritten), as the Aim card has them.
 *
 * Start stays on the web and is offered only while ROADMAP_GOALS_LIVE is on (`startable`, from the card's goalsLive):
 * with the switch off a planned milestone reads "Milestone 1 is planned." and nothing offers to start it.
 *
 * Pure and client-importable: no Prisma, no clock (today is handed in), no randomness. Relative imports on purpose
 * (scripts run it under tsx, and the mobile API's pure half imports it).
 */
import { DAY_START_HOUR, addDays, weekdayOf, type DayKey } from "./life-day";
import {
  WEEK_QUEST_FINAL_LAG_DAYS,
  isQuestWeekFinal,
  type AimCardView,
  type PastWeekView,
  type TextClass,
  type WeekQuestKind,
  type WeekQuestRow,
  type WeekQuestState,
  type WeekQuestUnit,
  type WeekQuestsView,
} from "./roadmap-types";

// ── The vocabulary (D11) ────────────────────────────────────────────────────

/** The roadmap goal. */
export const MAIN_QUEST = "Main quest";
/** One stage of the main quest. */
export const MILESTONE = "Milestone";
/** The started milestone's week quests, frozen Monday 04:00. */
export const SPRINT = "This week's sprint";
/** The review step's name and the phone's eyebrow. */
export const SPRINT_SHORT = "Sprint";
/** The finished weeks on the roadmap page. */
export const PAST_SPRINTS = "Past sprints";
/** What the Short, Mid and Long goals are to the main quest. */
export const KEY_RESULTS = "Key results";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const EDGE = `${String(DAY_START_HOUR).padStart(2, "0")}:00`;

/** When a sprint's share is final: the weekday WEEK_QUEST_FINAL_LAG_DAYS after its Sunday, at the day edge ("Wed 04:00"). */
export const SPRINT_FINAL_AT = `${WEEKDAY_SHORT[(6 + WEEK_QUEST_FINAL_LAG_DAYS) % 7]} ${EDGE}`;
/** The share on the week's Sunday and while it settles: a count, never a verdict. */
export const SPRINT_PROVISIONAL_LINE = `provisional · final ${SPRINT_FINAL_AT}`;
/** Past its Wednesday, before the chain has written the week. */
export const SPRINT_SETTLING_LINE = "still settling";
/** The written week. */
export const SPRINT_FINAL_LINE = "final";

/** '7 Mar'. */
function dayMonth(key: DayKey): string {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

/** 'Sun 7 Mar'. */
function weekdayDate(key: DayKey): string {
  return `${WEEKDAY_SHORT[weekdayOf(key) - 1]} ${dayMonth(key)}`;
}

/** 'Week of 19 Oct'. */
export function sprintWeekLabel(weekStart: DayKey): string {
  return `Week of ${dayMonth(weekStart)}`;
}

// ── The sprint (D12) ────────────────────────────────────────────────────────

/** live: the week is under way; provisional: its Sunday, or ended and not yet final; settling: past its Wednesday, not yet written; final: written. */
export type SprintStatus = "live" | "provisional" | "settling" | "final";

/** A sprint's share as a surface may state it. `done`/`total` are null when only the stored verdict could say (a settling week). */
export interface SprintShare {
  status: SprintStatus;
  done: number | null;
  total: number | null;
  /** The words after the count ("provisional · final Wed 04:00"); null while the week is under way. */
  line: string | null;
}

export interface SprintRow {
  kind: WeekQuestKind;
  label: string;
  count: number;
  /** The verified progress (the row's own evidence), never above what a tick or a reading recorded. */
  progress: number;
  unit: WeekQuestUnit;
  done: boolean;
  /** "3 of 8 cards", "1 of 3 sessions", "not logged yet": always with its unit. */
  countLine: string;
  /** A PRACTICE or STEP row's task on Today: ticked through the board (and the phone's /tasks/complete), never here. */
  templateId: string | null;
}

export interface Sprint {
  milestoneId: string;
  milestoneOrd: number;
  weekStart: DayKey;
  weekEnd: DayKey;
  /** OPEN, HELD (a held week asks nothing) or PAST_DUE (its milestone is past its day: no rows). */
  state: WeekQuestState;
  done: number;
  total: number;
  rows: SprintRow[];
  share: SprintShare;
}

const UNIT_WORDS: Readonly<Record<WeekQuestUnit, [string, string]>> = {
  card: ["card", "cards"],
  session: ["session", "sessions"],
  day: ["day", "days"],
  step: ["step", "steps"],
  log: ["score", "scores"],
};

/** A row's count, as the roadmap's own rows say it (roadmap-copy weekQuestCountLine's words; roadmap-ui-check compares the two). */
export function sprintRowCountLine(kind: WeekQuestKind, progress: number, total: number, unit: WeekQuestUnit, done: boolean): string {
  if (kind === "CHECKPOINT") return done ? "logged · done" : "not logged yet";
  const [one, many] = UNIT_WORDS[unit];
  const line = `${Math.max(0, Math.floor(progress))} of ${total} ${total === 1 ? one : many}`;
  return done ? `${line} · done` : line;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

function rowOf(r: WeekQuestRow): SprintRow {
  const progress = Math.max(0, Number(r.figure?.value) || 0);
  const templateId = typeof r.seekTemplateId === "string" && ID.test(r.seekTemplateId) ? r.seekTemplateId : null;
  return { kind: r.kind, label: r.label, count: r.count, progress, unit: r.unit, done: r.done, countLine: sprintRowCountLine(r.kind, progress, r.count, r.unit, r.done), templateId };
}

/**
 * A week under way: its live count, plain while the week runs, "provisional · final Wed 04:00" from its Sunday until
 * the chain writes it. Never "final": only the stored results are (pastSprintShareOf).
 */
export function sprintShareOf(weekStart: DayKey, done: number, total: number, today: DayKey): SprintShare {
  const sunday = addDays(weekStart, 6);
  if (today < sunday) return { status: "live", done, total, line: null };
  if (!isQuestWeekFinal(sunday, today)) return { status: "provisional", done, total, line: SPRINT_PROVISIONAL_LINE };
  return { status: "settling", done, total, line: SPRINT_SETTLING_LINE };
}

/** A finished week from its stored line: final once written; before its Wednesday 04:00 provisional, after it settling (no figure either way). */
export function pastSprintShareOf(p: Pick<PastWeekView, "weekStart" | "settled" | "done" | "total">, today: DayKey): SprintShare {
  if (p.settled) return { status: "final", done: p.done, total: p.total, line: SPRINT_FINAL_LINE };
  const sunday = addDays(p.weekStart, 6);
  return isQuestWeekFinal(sunday, today)
    ? { status: "settling", done: null, total: null, line: SPRINT_SETTLING_LINE }
    : { status: "provisional", done: null, total: null, line: SPRINT_PROVISIONAL_LINE };
}

/** The sprint of a week's set as Today shows it (its rows, their count lines, its share); null with no set. */
export function sprintOf(week: WeekQuestsView | null | undefined, today: DayKey): Sprint | null {
  if (!week) return null;
  const rows = week.state === "OPEN" ? week.rows.map(rowOf) : [];
  return {
    milestoneId: week.milestoneId,
    milestoneOrd: week.milestoneOrd,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    state: week.state,
    done: week.done,
    total: week.total,
    rows,
    share: sprintShareOf(week.weekStart, week.done, week.total, today),
  };
}

/** "2 of 5 done", "all 5 done", "nothing asked"; null figures (a settling week) read nothing. */
export function sprintCountLine(done: number | null, total: number | null): string | null {
  if (done == null || total == null) return null;
  if (total <= 0) return "nothing asked";
  return done >= total ? `all ${total} done` : `${done} of ${total} done`;
}

/** "This week's sprint · 2 of 5 done", "… · held this week", with the share's words on its Sunday ("· provisional · final Wed 04:00"). */
export function sprintLine(s: Sprint): string {
  if (s.state === "HELD") return `${SPRINT} · held this week`;
  if (s.state === "PAST_DUE") return `${SPRINT} · none while the milestone is past its day`;
  const parts = [SPRINT, sprintCountLine(s.share.done, s.share.total), s.share.line].filter((x): x is string => !!x);
  return parts.join(" · ");
}

// ── The main quest (D11) ────────────────────────────────────────────────────

/**
 * NONE      no open goal (a quiet "No main quest yet", or nothing once suggestions are off)
 * DRAFT     a draft is being written or waits for its check
 * PLANNED   accepted, the current milestone not started (Start only while ROADMAP_GOALS_LIVE is on)
 * ACTIVE    a milestone under way (or reached, waiting for the next)
 * PAST_DUE  the started milestone is past its day
 * PAUSED    the goal is paused
 * DONE      the aim was reached or closed
 * LEGACY    a plan made before revision 4: its roadmap starts it again
 */
export type MainQuestState = "NONE" | "DRAFT" | "PLANNED" | "ACTIVE" | "PAST_DUE" | "PAUSED" | "DONE" | "LEGACY";

export interface MainQuest {
  state: MainQuestState;
  roadmapId: string | null;
  /** The quest in the user's words (the goal's own name, else its aim); null with none. */
  title: string | null;
  /** Its roadmap page, where Start and every plan edit live (web only); /you/roadmap/new with none. */
  href: string;
  milestone: {
    id: string;
    ord: number;
    of: number;
    title: string;
    /** The title's provenance (the Aim card's provenanceOf): DRAFT and KEPT_SUGGESTION carry Gemini's words; null when not given. */
    titleClass: TextClass | null;
    /** A Gemini title's NUMBER spans, struck through wherever it is shown (never rewritten); [] when none. */
    titleStruck: [number, number][];
    status: "PLANNED" | "STARTED" | "REACHED" | "PENDING_REACH" | "PAST_DUE";
    /** Its headline share (goalPercent of the binding part), null when not measured yet or not started. */
    percent: number | null;
    dueDay: DayKey | null;
  } | null;
  /** The quest's one line, in neutral words ("Milestone 1 is planned.", "42% of the way · due Sun 7 Mar"). */
  line: string;
  /** Start is offered on the web: a planned milestone, ROADMAP_GOALS_LIVE on and a server that writes. False otherwise, always. */
  startable: boolean;
  /** The aim suggestions are on (LifeSettings.aimSuggestions is not false): an empty quest may say so quietly. */
  suggest: boolean;
  /** This week's sprint, when the started milestone has one this week. */
  sprint: Sprint | null;
}

const ROADMAP_PAGE = "/you/roadmap";
const ROADMAP_NEW = "/you/roadmap/new";

const titleOf = (card: AimCardView): string | null => card.label?.trim() || card.aim?.trim() || null;

/** A card whose milestone is under way: started (or past its day, or reached and waiting to count), so it may run a sprint. */
export function milestoneUnderWay(card: AimCardView | null | undefined): boolean {
  if (!card || !card.roadmapId || card.legacy || card.paused) return false;
  if (card.state !== "ACTIVE" && card.state !== "PAST_DUE") return false;
  return card.milestone != null && card.milestone.status !== "PLANNED";
}

/**
 * Which open goal is the main quest, from loadAimCards' cards (one per open goal in seat order, or the one fallback
 * card when none is open): the lowest seat whose milestone is under way, else the lowest seat. So a draft or a planned
 * goal on seat 1 never hides the sprint seat 2 is running. null with no card (a missing table).
 */
export function mainQuestPickOf(cards: readonly AimCardView[] | null | undefined): AimCardView | null {
  if (!cards || cards.length === 0) return null;
  return cards.find(milestoneUnderWay) ?? cards[0];
}

/** The title's struck spans as the card gives them, kept only when they are integer pairs. */
function struckOf(spans: readonly (readonly number[])[] | null | undefined): [number, number][] {
  if (!Array.isArray(spans)) return [];
  return spans.filter((x) => Array.isArray(x) && x.length === 2 && Number.isInteger(x[0]) && Number.isInteger(x[1])).map((x): [number, number] => [x[0], x[1]]);
}

/**
 * The main quest from its Aim card (mainQuestPickOf over loadAimCards) and its goal's set this week (main-quest-server
 * loadMainQuestWeek). The set is the quest's sprint only when it is its current milestone's (a set of another goal's
 * is never shown as this quest's). Never throws: an unreadable card reads as none.
 */
export function mainQuestOf(card: AimCardView | null | undefined, week: WeekQuestsView | null | undefined, today: DayKey): MainQuest {
  const none: MainQuest = { state: "NONE", roadmapId: null, title: null, href: ROADMAP_NEW, milestone: null, line: "No main quest yet.", startable: false, suggest: card?.aimSuggestions !== false, sprint: null };
  try {
    if (!card || card.state === "EMPTY" || !card.roadmapId) return none;
    const base: MainQuest = { ...none, roadmapId: card.roadmapId, title: titleOf(card), href: ROADMAP_PAGE };
    if (card.legacy) return { ...base, state: "LEGACY", line: "An older plan: its roadmap starts it again." };
    if (card.state === "RUNNING") return { ...base, state: "DRAFT", line: "Drafting its roadmap." };
    if (card.state === "DRAFT") {
      const n = card.draftItems ?? 0;
      return { ...base, state: "DRAFT", line: n > 0 ? `A draft is waiting for your check · ${n} ${n === 1 ? "item" : "items"}.` : "A draft is waiting for your check." };
    }
    if (card.state === "DONE") return { ...base, state: "DONE", line: card.reachedDay ? `Reached ${dayMonth(card.reachedDay)}.` : "Closed." };
    if (card.paused) return { ...base, state: "PAUSED", line: `Paused since ${dayMonth(card.paused.since)}.` };
    const m = card.milestone;
    if (!m) {
      return card.reachedDay
        ? { ...base, state: "ACTIVE", line: "Every milestone is reached: mark it done on its roadmap." }
        : { ...base, state: "ACTIVE", line: "Its roadmap has what comes next." };
    }
    const milestone = { id: m.id, ord: m.ord, of: m.of, title: m.title, titleClass: m.titleClass ?? null, titleStruck: struckOf(m.titleStruck), status: m.status, percent: m.status === "PLANNED" ? null : m.percent, dueDay: m.dueDay };
    const sprint = week && week.milestoneId === m.id && m.status !== "PLANNED" ? sprintOf(week, today) : null;
    switch (m.status) {
      case "PLANNED": {
        const startable = card.goalsLive === true && !card.writesOff;
        return { ...base, state: "PLANNED", milestone, startable, line: startable ? `${MILESTONE} ${m.ord} is ready to start.` : `${MILESTONE} ${m.ord} is planned.` };
      }
      case "PAST_DUE":
        return { ...base, state: "PAST_DUE", milestone, sprint, line: m.dueDay ? `${MILESTONE} ${m.ord} was due ${weekdayDate(m.dueDay)}: close or reschedule it.` : `${MILESTONE} ${m.ord} is past its day: close or reschedule it.` };
      case "PENDING_REACH":
        return { ...base, state: "ACTIVE", milestone, sprint, line: m.countsFrom ? `Reached · counts from ${WEEKDAY_SHORT[weekdayOf(m.countsFrom) - 1]}.` : "Reached · it counts once confirmed." };
      case "REACHED":
        return { ...base, state: "ACTIVE", milestone, sprint, line: `${MILESTONE} ${m.ord} is reached.` };
      default: {
        const share = m.percent != null ? `${m.percent}% of the way` : "Not measured yet";
        return { ...base, state: "ACTIVE", milestone, sprint, line: m.dueDay ? `${share} · due ${weekdayDate(m.dueDay)}` : share };
      }
    }
  } catch {
    return none;
  }
}

/** "Milestone 2 of 6": the head a surface sets before the title (which it shows with its struck numbers and its chip). */
export function milestoneHeadOf(m: Pick<NonNullable<MainQuest["milestone"]>, "ord" | "of">): string {
  return `${MILESTONE} ${m.ord} of ${m.of}`;
}

/** "Milestone 2 of 6 · Familiar with the basics": the plain words (a spoken line); a surface shows the title's chip beside it. */
export function milestoneLineOf(m: Pick<NonNullable<MainQuest["milestone"]>, "ord" | "of" | "title">): string {
  return `${milestoneHeadOf(m)}${m.title.trim() ? ` · ${m.title.trim()}` : ""}`;
}

// ── The weekly review's Sprint step ─────────────────────────────────────────

/** The reviewed week's sprint: its share (null when the quest ran no sprint that week, or it was held). */
export interface SprintReview {
  weekStart: DayKey;
  label: string;
  share: SprintShare | null;
  /** The week under way is held: it asks nothing (sprintLine's "held this week"), which is not "no sprint". */
  held: boolean;
}

/**
 * The reviewed week's share: this week's own live count when it is the week under way (Saturday and Sunday), else its
 * stored line (Monday to Wednesday: provisional until its Wednesday 04:00, then the written figures).
 */
export function sprintReviewOf(reviewedMonday: DayKey, today: DayKey, current: Sprint | null, past: readonly Pick<PastWeekView, "weekStart" | "settled" | "done" | "total">[]): SprintReview {
  const label = sprintWeekLabel(reviewedMonday);
  if (current && current.weekStart === reviewedMonday) return { weekStart: reviewedMonday, label, share: current.state === "OPEN" ? current.share : null, held: current.state === "HELD" };
  const p = past.find((w) => w.weekStart === reviewedMonday) ?? null;
  return { weekStart: reviewedMonday, label, share: p ? pastSprintShareOf(p, today) : null, held: false };
}

/** The reviewed week, held (the words sprintLine says after "This week's sprint"). */
export const SPRINT_HELD_LINE = "held this week";
/** The reviewed week, when this quest ran no sprint in it (another goal's sprint is not this quest's). */
export const NO_SPRINT_LINE = "No sprint for this quest that week.";

/** The reviewed week's line: "3 of 5 done · provisional · final Wed 04:00", "held this week", or NO_SPRINT_LINE. */
export function sprintReviewLine(r: SprintReview): string {
  if (r.share) return [sprintCountLine(r.share.done, r.share.total), r.share.line].filter((x): x is string => !!x).join(" · ");
  return r.held ? SPRINT_HELD_LINE : NO_SPRINT_LINE;
}

/** The Sprint step's facts (P15): the main quest now and the reviewed week's sprint. */
export interface SprintStep {
  quest: MainQuest;
  reviewed: SprintReview;
}

/** Whether a page reads the quest's past sprints (loadPastWeeks) for the step: a goal that may have run one (not none, a draft or an older plan). */
export function readsPastSprints(q: MainQuest): q is MainQuest & { roadmapId: string } {
  return q.roadmapId != null && q.state !== "NONE" && q.state !== "DRAFT" && q.state !== "LEGACY";
}

/**
 * The Sprint step, only when it has something to show: the reviewed week's share (a provisional or written line), a
 * held week, or this week's sprint under way (OPEN or HELD). Null otherwise, and then the step does not run: the
 * review's step list, its card's words and the runner all key on this one value. While ROADMAP_GOALS_LIVE is off no
 * milestone starts, so the review never grows an always-empty step.
 */
export function sprintStepOf(quest: MainQuest, reviewedMonday: DayKey, today: DayKey, past: readonly Pick<PastWeekView, "weekStart" | "settled" | "done" | "total">[]): SprintStep | null {
  if (quest.state === "NONE") return null;
  const reviewed = sprintReviewOf(reviewedMonday, today, quest.sprint, past);
  const running = quest.sprint != null && (quest.sprint.state === "OPEN" || quest.sprint.state === "HELD");
  return reviewed.share != null || reviewed.held || running ? { quest, reviewed } : null;
}

/** The step's note under the share: a count, never a verdict (D12). */
export const SPRINT_STEP_NOTE = `A sprint is a count, never a verdict: its week is written from the ${SPRINT_FINAL_AT} after its Sunday.`;
