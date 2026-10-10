/**
 * True facts about a review, and the review quest (redesign L2).
 *
 * The runner used to answer a correct card with a random affirmation
 * ("Nice.", "Sharp."). It now states something that is true about this
 * recall, read from the Idea's own history in the life ledger: how long it
 * had been, whether that is the longest gap yet, whether it clears an
 * earlier miss, whether it rescued an overdue card, how close it is to
 * mastery. Nothing here is random: the same history and the same answer
 * always produce the same sentence.
 *
 * Pure. The server action reads the rows (src/app/review/review-data.ts)
 * and hands them over; the browser uses the session half (sessionFactsOf)
 * for the recap. scripts/review-check.ts covers every branch.
 */
import { daysBetween, type DayKey } from "./life-day";
import { MASTERY_LEVEL } from "./xp";
import { levelLossPoints } from "./forgetting";

/** "2.4" or "31": points to one decimal, whole when whole. */
const fmtPoints = (n: number): string => (Math.round(n * 10) / 10).toFixed(Math.round(n * 10) % 10 === 0 ? 0 : 1);

// ── The review quest ──────────────────────────────────────────────────────

/**
 * The day's review quest is at most this many cards: the M2 FULL_DAY rule
 * ("quest ≥ 15 or nothing due"), so a backlog never makes a day unwinnable.
 * The Today board's Full-day Quest ring and this hub read the same number.
 */
export const REVIEW_QUEST_CARDS = 15;

/**
 * The quest's target for today. The uncapped figure is exactly the Today
 * board's (today-board.ts questOf): fixed at the day's first open
 * (DAY_OPEN), or reviews + due before that row exists. Capped at
 * REVIEW_QUEST_CARDS.
 */
export function questTargetOf(dayOpenQty: number | null, reviewsToday: number, dueNow: number): number {
  const uncapped = Math.max(0, Math.round(dayOpenQty ?? reviewsToday + dueNow));
  return Math.min(REVIEW_QUEST_CARDS, uncapped);
}

export interface QuestState {
  done: number;
  target: number;
  cleared: boolean;
}

export function questStateOf(reviewsToday: number, target: number): QuestState {
  const done = Math.max(0, reviewsToday);
  return { done, target, cleared: target > 0 && done >= target };
}

/** "about 9 minutes": the hub's estimate, at twenty seconds a card. Always labelled "about". */
export function minutesFor(cards: number): number {
  return Math.max(1, Math.round((Math.max(0, cards) * 20) / 60));
}

// ── History ───────────────────────────────────────────────────────────────

export type HistoryMark = "added" | "pass" | "miss";

/** One life-day event in an Idea's history, oldest first. */
export interface HistoryEntry {
  day: DayKey;
  mark: HistoryMark;
}

/**
 * A ledger REVIEW row's outcome, from the detail srs.ts writes: "advanced"
 * (or "advanced · mastered") for a pass; "strike", "degraded" or "shielded"
 * for a miss. Backfilled history ("backfill: passed review") only ever
 * recorded passes.
 */
export function reviewMarkOf(detail: string | null | undefined): "pass" | "miss" {
  const d = (detail ?? "").toLowerCase();
  if (d.startsWith("strike") || d.startsWith("degraded") || d.startsWith("shielded")) return "miss";
  return "pass";
}

/** A ledger row as review-data.ts reads it (REVIEW and IDEA_CREATE rows for one Idea). */
export interface HistoryRow {
  source: string;
  detail: string | null;
  /** Its life day (ActivityEvent.day, as a key). */
  day: DayKey;
}

/**
 * Ledger rows → the Idea's history, oldest first. An IDEA_CREATE row marks
 * the day it was added (the ledger's own record; `addedDay` from the Idea
 * row covers Ideas older than the ledger). Order is by day, then passes and
 * misses as the rows came.
 */
export function historyOf(rows: readonly HistoryRow[], addedDay: DayKey | null): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  const created = rows.find((r) => r.source === "IDEA_CREATE")?.day ?? addedDay;
  if (created) out.push({ day: created, mark: "added" });
  for (const r of rows) {
    if (r.source !== "REVIEW") continue;
    out.push({ day: r.day, mark: reviewMarkOf(r.detail) });
  }
  // Stable by day: a review can never predate the add, but a backfilled row can land on the same day.
  return out
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.day < b.e.day ? -1 : a.e.day > b.e.day ? 1 : a.i - b.i))
    .map(({ e }) => e);
}

/** Gaps (in life days) between consecutive events, oldest first: added → first review → … */
export function gapsOf(history: readonly HistoryEntry[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < history.length; i++) out.push(daysBetween(history[i - 1].day, history[i].day));
  return out;
}

// ── One card ──────────────────────────────────────────────────────────────

export type TrueFactKind =
  | "mastered"
  | "clean-after-miss"
  | "rescued"
  | "gap"
  | "first"
  | "level"
  | "strike"
  | "degraded"
  | "shielded";

export interface TrueFact {
  kind: TrueFactKind;
  /** The result panel's display line ("Recalled after 34 days"). */
  headline: string;
  /** The meta line under it ("Longest gap yet for this idea · next review in 71 days"). */
  detail: string;
  /** Life days since the last review, or since it was added when the ledger has no review. Null when unknown. */
  gapDays: number | null;
  /** True when gapDays is longer than every earlier gap this Idea has had. */
  longestGap: boolean;
  /** Life days past its due day when answered (0 when on time). */
  overdueDays: number;
  /** The day of the miss this recall cleared, when it cleared one. */
  clearedMissDay: DayKey | null;
}

export type MissOutcome =
  | { kind: "strike"; strike: number; limit: number }
  | { kind: "degraded"; levelBefore: number; levelAfter: number }
  | { kind: "shielded"; skillName: string; level: number };

export interface FactInput {
  correct: boolean;
  /** Today's life day. */
  today: DayKey;
  /** Events before this review, oldest first (historyOf in review-data.ts). */
  history: readonly HistoryEntry[];
  /** The life day the Idea was added. */
  addedDay: DayKey | null;
  levelBefore: number;
  levelAfter: number;
  failedAttemptsBefore: number;
  mastered: boolean;
  /** Life days past the due day (≥ 0). */
  overdueDays: number;
  /** The interval actually scheduled (days), for a pass. */
  intervalDays: number | null;
  miss?: MissOutcome;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-19" → "19 Sep". Pure calendar text on the key; no time zone involved. */
export function shortDay(key: DayKey): string {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[(m - 1 + 12) % 12]}`;
}

export function daysText(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

/** "next review in 71 days" / "next review tomorrow". */
export function nextReviewText(intervalDays: number | null): string | null {
  if (intervalDays == null) return null;
  if (intervalDays <= 0) return "next review today";
  if (intervalDays === 1) return "next review tomorrow";
  return `next review in ${daysText(intervalDays)}`;
}

const join = (parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(" · ");

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** The one true sentence for this recall (or this miss). */
export function trueFactOf(input: FactInput): TrueFact {
  const reviews = input.history.filter((h) => h.mark !== "added");
  const last = reviews[reviews.length - 1] ?? null;
  const priorGaps = gapsOf(input.history);
  const gapDays: number | null = last
    ? Math.max(0, daysBetween(last.day, input.today))
    : input.addedDay
      ? Math.max(0, daysBetween(input.addedDay, input.today))
      : null;
  const longestGap = gapDays != null && gapDays > 0 && priorGaps.length > 0 && priorGaps.every((g) => gapDays > g);
  const overdueDays = Math.max(0, Math.round(input.overdueDays));
  const next = nextReviewText(input.intervalDays);
  const base = { gapDays, longestGap, overdueDays, clearedMissDay: null as DayKey | null };

  if (!input.correct) {
    const m = input.miss ?? { kind: "strike" as const, strike: input.failedAttemptsBefore + 1, limit: input.failedAttemptsBefore + 2 };
    if (m.kind === "degraded") {
      return {
        ...base,
        kind: "degraded",
        headline: "Not this time",
        detail: join([
          "Back tomorrow",
          `level ${m.levelBefore} → ${m.levelAfter}`,
          m.levelAfter < m.levelBefore ? `the Domain gives back the ${fmtPoints(levelLossPoints(m.levelBefore))} points that level earned` : "nothing else is taken",
        ]),
      };
    }
    if (m.kind === "shielded") {
      return { ...base, kind: "shielded", headline: "Not this time", detail: join(["Back tomorrow", `${m.skillName} held level ${m.level}`, "nothing else is taken"]) };
    }
    return { ...base, kind: "strike", headline: "Not this time", detail: join(["Back tomorrow", `strike ${m.strike} of ${m.limit}`, "nothing else is taken"]) };
  }

  const gapText = gapDays != null && last ? (gapDays === 0 ? "recalled again today" : `recalled after ${daysText(gapDays)}`) : null;
  const nearMastery = input.levelAfter === MASTERY_LEVEL - 1 ? "one clean recall from mastery" : null;

  if (input.mastered) {
    return { ...base, kind: "mastered", headline: `Mastered · level ${MASTERY_LEVEL} of ${MASTERY_LEVEL}`, detail: capitalise(join([gapText, next])) };
  }
  if (last && last.mark === "miss") {
    return {
      ...base,
      clearedMissDay: last.day,
      kind: "clean-after-miss",
      headline: "First clean recall after a miss",
      detail: join([`The miss on ${shortDay(last.day)} is cleared`, nearMastery, next]),
    };
  }
  if (overdueDays >= 1) {
    return { ...base, kind: "rescued", headline: `Rescued, ${daysText(overdueDays)} overdue`, detail: capitalise(join([gapText, nearMastery, next])) };
  }
  if (last && gapDays != null) {
    if (gapDays === 0) return { ...base, kind: "gap", headline: "Recalled again today", detail: capitalise(join([nearMastery, next])) };
    return {
      ...base,
      kind: "gap",
      headline: `Recalled after ${daysText(gapDays)}`,
      detail: capitalise(join([longestGap ? "longest gap yet for this idea" : null, nearMastery, next])),
    };
  }
  if (input.levelBefore <= 1 && input.failedAttemptsBefore === 0) {
    const added =
      input.addedDay != null
        ? gapDays === 0
          ? "added today"
          : `added ${daysText(gapDays ?? 0)} ago`
        : null;
    return { ...base, kind: "first", headline: "First recall", detail: capitalise(join([added, next])) };
  }
  return { ...base, kind: "level", headline: `Level ${input.levelBefore} → ${input.levelAfter}`, detail: capitalise(join([nearMastery, next])) };
}

// ── A whole session (the recap's "True facts") ────────────────────────────

export interface SessionCardFact {
  /** The idea's display title. */
  title: string;
  correct: boolean;
  fact: TrueFact;
  levelAfter: number;
  /** The life day it comes back, for "One clean recall on 9 Oct masters it". */
  nextDueDay: DayKey | null;
  mastered: boolean;
}

/** One recap sentence in three runs, so the figure can be set in ink-0. */
export interface FactLine {
  before: string;
  strong: string;
  after: string;
}

/** At most four, in a fixed order. Each line is computed from this session's results only. */
export function sessionFactsOf(cards: readonly SessionCardFact[]): FactLine[] {
  const out: FactLine[] = [];
  const passed = cards.filter((c) => c.correct);

  const mastered = passed.filter((c) => c.mastered);
  for (const m of mastered.slice(0, 2)) out.push({ before: "Mastered: ", strong: m.title, after: `, level ${MASTERY_LEVEL} of ${MASTERY_LEVEL}.` });

  let longest: SessionCardFact | null = null;
  for (const c of passed) {
    const g = c.fact.gapDays;
    if (g != null && g >= 2 && (longest == null || g > (longest.fact.gapDays ?? 0))) longest = c;
  }
  if (longest) out.push({ before: "Longest gap recalled: ", strong: daysText(longest.fact.gapDays ?? 0), after: ` · ${longest.title}.` });

  let closest: SessionCardFact | null = null;
  for (const c of passed) {
    if (c.mastered || c.levelAfter >= MASTERY_LEVEL || c.levelAfter < MASTERY_LEVEL - 3) continue;
    if (closest == null || c.levelAfter > closest.levelAfter) closest = c;
  }
  if (closest) {
    const toGo = MASTERY_LEVEL - closest.levelAfter;
    const when = closest.nextDueDay ? ` on ${shortDay(closest.nextDueDay)}` : "";
    out.push({
      before: "Closest to mastery: ",
      strong: closest.title,
      after:
        toGo === 1
          ? `, level ${closest.levelAfter} of ${MASTERY_LEVEL}. One clean recall${when} masters it.`
          : `, level ${closest.levelAfter} of ${MASTERY_LEVEL}. ${toGo} clean recalls from mastery.`,
    });
  }

  const rescued = passed.filter((c) => c.fact.overdueDays >= 1).length;
  if (rescued > 0) out.push({ before: "Rescued ", strong: `${rescued} overdue`, after: rescued === 1 ? " card; it is back on schedule." : " cards; they are back on schedule." });

  const cleared = passed.filter((c) => c.fact.clearedMissDay != null).length;
  if (cleared > 0) out.push({ before: "Cleared ", strong: `${cleared} earlier miss${cleared === 1 ? "" : "es"}`, after: " with a clean recall." });

  return out.slice(0, 4);
}
