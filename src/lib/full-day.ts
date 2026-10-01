/**
 * The Full-day card (redesign "Sigil & Slate"), read-only from today's board.
 *
 * It is the M2 FULL_DAY rule (docs/life-plan/m2.md, rule 7), shown as three
 * promise rings in the Day ledger:
 *
 *   Musts  every compulsory task due today is done (the minimum counts) or excused;
 *   Quest  the knowledge quest is met: nothing was due, the queue is clear,
 *          or at least QUEST_CAP (15) reviews today;
 *   Life   at least one life deed: a TASK that is not study-linked (study
 *          tasks are paid by the reviews), or a WORKOUT (M4).
 *
 * Pure: no database, no clock, no React. The board computes it from the
 * same optimistic BoardData it renders, so a tick closes a ring on the tap.
 * M2's settlement is what pays FULL_DAY_MP; nothing here pays anything.
 *
 * The quest target is capped at 15 so a backlog never makes a day
 * unwinnable: 142 due still reads "Quest 0 of 15", never "0 of 142".
 */
import type { Board, BoardData, Quest } from "./today-board";
import { STUDY_METRICS } from "./today-board";
import { REVIEW_QUEST_CARDS } from "./review-facts";

/**
 * Reviews that meet the quest whatever the backlog (the M2 rule's ≥ 15).
 * The /review hub's own constant (review-facts.ts), so the Quest ring, Next
 * up and the hub can never disagree about the target.
 */
export const QUEST_CAP: number = REVIEW_QUEST_CARDS;
/** What a Full day pays once M2's daily settlement exists. Stated, never paid here. */
export const FULL_DAY_MP = 0.5;

export type FullDayRingKind = "musts" | "quest" | "life";

export interface FullDayRing {
  kind: FullDayRingKind;
  label: "Musts" | "Quest" | "Life";
  /** What the ring draws toward `target` (display units). */
  value: number;
  /** The ring's fixed target (≥ 1). */
  target: number;
  met: boolean;
  /** "2 of 3", "None today", "Nothing due", "5 of 5 · queue clear". */
  caption: string;
}

export interface FullDayInput {
  /** Must rows due today: kept = done (the minimum included) or excused. */
  musts: { kept: number; total: number };
  /** Today's reviews, the quest's day-open target (questOf) and what is still due. */
  quest: { reviews: number; target: number; dueNow: number };
  /** Today's life deeds (non-study TASK completions). */
  lifeDeeds: number;
  /** Today's workouts (M4; 0 until health sync). */
  workouts?: number;
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

export function questRingOf(q: FullDayInput["quest"]): FullDayRing {
  const reviews = Math.max(0, Math.floor(q.reviews));
  const target = Math.max(0, Math.floor(q.target));
  const dueNow = Math.max(0, Math.floor(q.dueNow));
  // Nothing was due when the day opened: met, with nothing to count. (The
  // target is fixed at the day's first open, so cards falling due later
  // never move the goalposts; questOf reads the same way.)
  if (target === 0) return { kind: "quest", label: "Quest", value: 1, target: 1, met: true, caption: "Nothing due" };
  const cap = Math.min(QUEST_CAP, target);
  const shown = Math.min(reviews, cap);
  const met = reviews >= cap || dueNow === 0;
  const caption = met && shown < cap ? `${shown} of ${cap} · queue clear` : `${shown} of ${cap}`;
  return { kind: "quest", label: "Quest", value: met ? cap : shown, target: cap, met, caption };
}

export function lifeRingOf(deeds: number, workouts = 0): FullDayRing {
  const n = Math.max(0, Math.floor(deeds)) + Math.max(0, Math.floor(workouts));
  const shown = Math.min(1, n);
  return { kind: "life", label: "Life", value: shown, target: 1, met: n >= 1, caption: `${shown} of 1` };
}

export function fullDayOf(input: FullDayInput): FullDay {
  const rings: FullDay["rings"] = [mustsRingOf(input.musts), questRingOf(input.quest), lifeRingOf(input.lifeDeeds, input.workouts ?? 0)];
  const met = rings.filter((r) => r.met).length;
  return { rings, met, full: met === 3 };
}

/** Excused instances (M2: rest, sick, vacation) count as kept for the Musts ring. */
const EXCUSED = "EXCUSED";

/**
 * Today's life deeds from the ledger: live TASK completions that are not
 * study-linked. A study task's completion is paid by the reviews (sink
 * NONE) and never makes a day on its own; a #play task is a real deed.
 */
export function lifeDeedsOf(data: Pick<BoardData, "templates" | "ledger">): number {
  const byId = new Map(data.templates.map((t) => [t.id, t]));
  let n = 0;
  for (const c of data.ledger.today.completions) {
    const t = c.templateId ? byId.get(c.templateId) : undefined;
    if (t) {
      if (t.autoMetric && STUDY_METRICS.has(t.autoMetric)) continue;
      n += 1;
    } else if (c.sink === "TRACK") {
      // A template no longer on the board (archived since): its sink says whether it was life work.
      n += 1;
    }
  }
  return n;
}

/** The Full-day input from the board the page renders (optimistic ops included). */
export function fullDayInputOf(data: Pick<BoardData, "templates" | "ledger" | "instances" | "today">, board: Pick<Board, "must">, quest: Pick<Quest, "progress" | "target" | "dueNow">): FullDayInput {
  const today = board.must.filter((r) => r.day === data.today);
  const excused = new Set(data.instances.filter((i) => i.day === data.today && i.status === EXCUSED).map((i) => i.templateId));
  const kept = today.filter((r) => r.state === "done" || excused.has(r.template.id)).length;
  return {
    musts: { kept, total: today.length },
    quest: { reviews: quest.progress, target: quest.target, dueNow: quest.dueNow },
    lifeDeeds: lifeDeedsOf(data),
    workouts: 0,
  };
}
