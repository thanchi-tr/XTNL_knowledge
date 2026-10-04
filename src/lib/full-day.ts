/**
 * The Full-day rule (M2 decision 7): one rule for the board's live rings and
 * for daily settlement, so a ring that closes on the board is never refused
 * by settlement two days later.
 *
 *   Musts  every must due that day is done (DONE, DONE_LATE, DONE_MVV) or
 *          EXCUSED: duty-rule.ts mustsDueOn, so fixed-schedule occurrences
 *          and deadline one-offs due that day; TARGET musts are never in it.
 *          A one-off already done before its due day is kept;
 *   Quest  the knowledge quest is met: the day's DAY_OPEN target was 0, or
 *          reviews that day ≥ min(QUEST_CAP, DAY_OPEN qty). With no DAY_OPEN
 *          row the day needs QUEST_CAP (15) reviews. ("Queue clear" is not a
 *          clause any more: a live dueNow cannot be rebuilt at d + 2.)
 *   Life   at least one life deed: a live TASK whose template is not
 *          study-linked (#play included). Workouts were M4, which is dropped.
 *
 * Pure: no database, no clock, no React. The board computes it from the
 * same optimistic BoardData it renders (fullDayInputOf); settlement computes
 * it from the settled day's facts (fullDayInputFor, settlement-plan.ts step
 * 8) and records a FULL_DAY row. The week judge pays FULL_DAY_MP (up to
 * +0.5 MP inside the 8 MP weekly cap, after the kept tracks); nothing here
 * pays anything.
 *
 * The quest target is capped at 15 so a backlog never makes a day
 * unwinnable: 142 due still reads "Quest 0 of 15", never "0 of 142".
 *
 * Exports: QUEST_CAP · FULL_DAY_MP · FullDayRingKind · FullDayRing · FullDayInput · FullDay
 *          mustsRingOf · questRingOf · lifeRingOf · fullDayOf · fullDayLine
 *          MUST_KEPT_STATUSES · FullDayInstance · FullDayHeld · mustsOfDay · DeedRow · isLifeDeed
 *          fullDayInputFor · lifeDeedsOf · fullDayInputOf
 */
import type { Board, BoardData, Quest } from "./today-board";
import { STUDY_METRICS } from "./today-board";
import { REVIEW_QUEST_CARDS } from "./review-facts";
import { LIFE_MP } from "./life-economy";
import { mustsDueOn, type DutyTemplate } from "./duty-rule";
import { parseRule } from "./recurrence";
import type { DayKey } from "./life-day";

/**
 * Reviews that meet the quest whatever the backlog (the M2 rule's ≥ 15).
 * The /review hub's own constant (review-facts.ts), so the Quest ring, Next
 * up and the hub can never disagree about the target.
 */
export const QUEST_CAP: number = REVIEW_QUEST_CARDS;
/**
 * What a Full day pays (life-economy LIFE_MP.FULL_DAY, the one source):
 * minted under LIFE_FULL_DAY by the week judge, after the kept tracks and
 * inside the 8 MP life-week cap, so "up to" (decision 6). Stated, never paid
 * here.
 */
export const FULL_DAY_MP: number = LIFE_MP.FULL_DAY;

export type FullDayRingKind = "musts" | "quest" | "life";

export interface FullDayRing {
  kind: FullDayRingKind;
  label: "Musts" | "Quest" | "Life";
  /** What the ring draws toward `target` (display units). */
  value: number;
  /** The ring's fixed target (≥ 1). */
  target: number;
  met: boolean;
  /** "2 of 3", "None today", "Nothing due", "5 of 15". */
  caption: string;
}

export interface FullDayInput {
  /** Musts due that day (mustsDueOn): kept = done (the minimum included) or excused. */
  musts: { kept: number; total: number };
  /**
   * The day's reviews and its DAY_OPEN target: the qty the DAY_OPEN row
   * recorded, or null when the day has no DAY_OPEN row (then it needs
   * QUEST_CAP reviews). `dueNow` is accepted and ignored: the "queue clear"
   * clause went with decision 7 (older callers still pass it).
   */
  quest: { reviews: number; target: number | null; dueNow?: number };
  /** The day's life deeds (live, non-study TASK completions). */
  lifeDeeds: number;
}

export interface FullDay {
  rings: [FullDayRing, FullDayRing, FullDayRing];
  /** Rings closed, 0..3. */
  met: number;
  full: boolean;
}

export function mustsRingOf(m: FullDayInput["musts"]): FullDayRing {
  const total = Math.max(0, Math.floor(m.total));
  const kept = Math.max(0, Math.min(total, Math.floor(m.kept)));
  if (total === 0) return { kind: "musts", label: "Musts", value: 1, target: 1, met: true, caption: "None today" };
  return { kind: "musts", label: "Musts", value: kept, target: total, met: kept >= total, caption: `${kept} of ${total}` };
}

/**
 * The quest ring: met when the day-open target was 0 ("Nothing due"), or
 * reviews ≥ min(QUEST_CAP, target). A null target (no DAY_OPEN row) needs
 * QUEST_CAP reviews. Nothing else meets it: the target is fixed at the day's
 * first open, so neither cards falling due later nor an empty queue move it.
 */
export function questRingOf(q: FullDayInput["quest"]): FullDayRing {
  const reviews = Math.max(0, Math.floor(Number.isFinite(q.reviews) ? q.reviews : 0));
  const target = q.target == null || !Number.isFinite(q.target) ? null : Math.max(0, Math.floor(q.target));
  if (target === 0) return { kind: "quest", label: "Quest", value: 1, target: 1, met: true, caption: "Nothing due" };
  const cap = target == null ? QUEST_CAP : Math.min(QUEST_CAP, target);
  const shown = Math.min(reviews, cap);
  return { kind: "quest", label: "Quest", value: shown, target: cap, met: reviews >= cap, caption: `${shown} of ${cap}` };
}

/** The life ring: at least one life deed. */
export function lifeRingOf(deeds: number): FullDayRing {
  const n = Math.max(0, Math.floor(Number.isFinite(deeds) ? deeds : 0));
  const shown = Math.min(1, n);
  return { kind: "life", label: "Life", value: shown, target: 1, met: n >= 1, caption: `${shown} of 1` };
}

export function fullDayOf(input: FullDayInput): FullDay {
  const rings: FullDay["rings"] = [mustsRingOf(input.musts), questRingOf(input.quest), lifeRingOf(input.lifeDeeds)];
  const met = rings.filter((r) => r.met).length;
  return { rings, met, full: met === 3 };
}

/** The rings in one line, the FULL_DAY row's detail: 'Musts 2 of 2 · Quest 15 of 15 · Life 1 of 1'. */
export function fullDayLine(day: FullDay): string {
  return day.rings.map((r) => `${r.label} ${r.caption}`).join(" · ");
}

// ── The shared inputs (board and settlement) ──────────────────────────────

/** Statuses that keep a must for the Musts ring: done (the minimum included) or excused. MADE_UP is not one. */
export const MUST_KEPT_STATUSES: ReadonlySet<string> = new Set(["DONE", "DONE_LATE", "DONE_MVV", "EXCUSED"]);
const DONE: ReadonlySet<string> = new Set(["DONE", "DONE_LATE", "DONE_MVV"]);

/** An instance as the Musts ring reads it. */
export interface FullDayInstance {
  templateId: string;
  day: DayKey;
  status: string;
}

/**
 * Whether day d is held, for a reader that has no EXCUSED instances yet (the
 * live board before settlement writes them). On a rest day (REST, SICK,
 * VACATION) every must due is held except one whose rule on d is 'Even on
 * rest days'; on a freeze day every must is (decision 15). Settlement never
 * passes it: it writes the EXCUSED instances first (steps 2 and 3).
 */
export interface FullDayHeld {
  rest?: boolean;
  freeze?: boolean;
}

/**
 * The Musts ring's count for day d: the musts due on d (duty-rule.ts
 * mustsDueOn: the rule in force on d, fixed occurrences and deadline
 * one-offs, never TARGET, never an inbox item), kept when an instance on d
 * is done or excused, (a one-off) when it was already done before d, or
 * when `held` says d holds it (FullDayHeld).
 */
export function mustsOfDay<T extends DutyTemplate & { id: string }>(
  templates: readonly T[],
  instances: readonly FullDayInstance[],
  d: DayKey,
  held: FullDayHeld = {}
): { kept: number; total: number } {
  const due = mustsDueOn(templates, d);
  if (due.length === 0) return { kept: 0, total: 0 };
  const ids = new Set(due.map((t) => t.id));
  const keptOn = new Set<string>();
  const doneBefore = new Set<string>();
  for (const i of instances) {
    if (!ids.has(i.templateId)) continue;
    if (i.day === d && MUST_KEPT_STATUSES.has(i.status)) keptOn.add(i.templateId);
    else if (i.day < d && DONE.has(i.status)) doneBefore.add(i.templateId);
  }
  let kept = 0;
  for (const t of due) {
    const heldHere = held.freeze === true || (held.rest === true && !t.compulsoryOnRest);
    if (keptOn.has(t.id) || (!parseRule(t.recurrence) && doneBefore.has(t.id)) || heldHere) kept += 1;
  }
  return { kept, total: due.length };
}

/** A TASK completion as the Life ring reads it. `studyLinked` null: the template is unknown (archived, or a non-must one-off). */
export interface DeedRow {
  sink: string;
  studyLinked: boolean | null;
}

/**
 * Whether a live TASK completion is a life deed: not study-linked (a study
 * task is paid by the reviews and never makes a day on its own), #play
 * included. A completion whose template is unknown counts by its sink.
 */
export function isLifeDeed(r: DeedRow): boolean {
  return r.studyLinked == null ? r.sink === "TRACK" : !r.studyLinked;
}

/**
 * The Full-day input for one day from its facts: the board (live, today) and
 * settlement (d + 2) both build it here, so both read one rule.
 */
export function fullDayInputFor<T extends DutyTemplate & { id: string }>(f: {
  templates: readonly T[];
  instances: readonly FullDayInstance[];
  day: DayKey;
  reviews: number;
  /** The day's DAY_OPEN qty; null when it has no DAY_OPEN row. */
  dayOpenQty: number | null;
  lifeDeeds: number;
  /** Optional: d is a rest or freeze day whose EXCUSED instances are not written yet (FullDayHeld). */
  held?: FullDayHeld;
}): FullDayInput {
  return {
    musts: mustsOfDay(f.templates, f.instances, f.day, f.held),
    quest: { reviews: f.reviews, target: f.dayOpenQty },
    lifeDeeds: f.lifeDeeds,
  };
}

/**
 * Today's life deeds from the board's ledger: live TASK completions that are
 * not study-linked. A study task's completion is paid by the reviews (sink
 * NONE) and never makes a day on its own; a #play task is a real deed.
 */
export function lifeDeedsOf(data: Pick<BoardData, "templates" | "ledger">): number {
  const byId = new Map(data.templates.map((t) => [t.id, t]));
  let n = 0;
  for (const c of data.ledger.today.completions) {
    const t = c.templateId ? byId.get(c.templateId) : undefined;
    const studyLinked = t ? !!(t.autoMetric && STUDY_METRICS.has(t.autoMetric)) : null;
    if (isLifeDeed({ sink: c.sink, studyLinked })) n += 1;
  }
  return n;
}

/**
 * The Full-day input from the board the page renders (optimistic ops
 * included). `board` is no longer read (the musts come from mustsDueOn, not
 * the Must lane's rows); it stays in the signature for the callers. The quest
 * target is the day's DAY_OPEN qty (null until the row exists), as
 * settlement will read it. `opts.held` (optional) counts today's held musts
 * as kept, as settlement's EXCUSED rows will: { rest: true } on a live rest
 * day. A caller that already adds EXCUSED instances for them (board-ui
 * withHeldExcused) needs neither; passing both counts each must once.
 */
export function fullDayInputOf(
  data: Pick<BoardData, "templates" | "ledger" | "instances" | "today">,
  board: Pick<Board, "must">,
  quest: Pick<Quest, "progress" | "target" | "dueNow">,
  opts: { held?: FullDayHeld } = {}
): FullDayInput {
  const templates = data.templates.map((t) => ({
    ...t,
    compulsoryOnRest: (t as { compulsoryOnRest?: boolean }).compulsoryOnRest ?? false,
    // A board template is live; a pending archive still applies per day through ruleOn.
    archivedDay: null,
  }));
  return fullDayInputFor({
    templates,
    instances: data.instances,
    day: data.today,
    reviews: quest.progress,
    dayOpenQty: data.ledger.today.dayOpenQty,
    lifeDeeds: lifeDeedsOf(data),
    ...(opts.held ? { held: opts.held } : {}),
  });
}
