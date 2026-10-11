/**
 * Character's day cards (/you): the streak and the Full day, moved off Today
 * when the app split into its three sections (Ideas, Tasks, Body). Both are
 * life measures that span the sections (a tick or a review keeps the day; a
 * Full day is the Musts, the review quest and one life deed), so they live
 * with the character.
 *
 * Read from the same data and by the same rules Today's board uses (the
 * board's cached read, lib/streak.ts DailyStreak, buildBoard, questOf,
 * withHeldExcused, fullDayOf and dayLedgerDutyOf), so the two never
 * disagree; Today still plays the moments when a tick keeps the day or
 * closes a ring. Pure: no React, no clock, no database.
 */
import { buildBoard, questOf, type BoardData } from "@/lib/today-board";
import { fullDayInputOf, fullDayOf, type FullDay } from "@/lib/full-day";
import { dayLedgerDutyOf, keptAtOf, streakCaptionOf, withHeldExcused, yesterdayActiveOf, type StreakDutyFields } from "@/components/today/board-ui";

export interface DayCardsView {
  streak: { count: number; capped: boolean; kept: boolean; broken: boolean };
  /** The caption under the numeral: a bold lead ("Kept today, 08:05.") and the rest, or Duty's own sentence. */
  caption: { lead: string | null; rest: string };
  freezes: { banked: number } | null;
  /** A held chip under the caption ("A freeze will cover Wed"). */
  heldNote: string | null;
  fullDay: FullDay;
  /** Daily settlement pays Full days (Duty is live). */
  settles: boolean;
  fullNote: string | null;
  aside: string | null;
  /** Yesterday's open occurrences: the card's "Record yesterday" link (to Today's sheet) says how many. */
  yesterdayOpen: number;
}

export function dayCardsOf(data: BoardData, streak: StreakDutyFields & { capped?: boolean }): DayCardsView {
  const board = buildBoard(data);
  const today = data.ledger.today;
  const quest = questOf({ dayOpenQty: today.dayOpenQty, reviews: today.reviews, dueNow: data.dueNow ?? 0, reviewXp: today.reviewXp });
  // Today's held musts (a rest day) count as excused, as settlement will record them (decision 15).
  const fullDay = fullDayOf(fullDayInputOf(withHeldExcused(data, board.must), board, quest));
  // A day with any live completion is an active day, before the streak's own read catches up.
  const todayActive = streak.last7Days[streak.last7Days.length - 1] ?? false;
  const kept = todayActive || board.activeToday;
  const count = streak.current + (!todayActive && board.activeToday ? 1 : 0);
  const duty = dayLedgerDutyOf({ duty: data.duty, streak, kept, full: fullDay.full, today: data.today, yesterdayActive: yesterdayActiveOf(streak, data) });
  const caption = duty.caption != null ? { lead: null, rest: duty.caption } : streakCaptionOf({ kept, keptAt: kept ? keptAtOf(data) : null, count });
  const yesterdayOpen = board.yesterdayRows.filter((r) => r.state === "open" || r.state === "locked").length;
  return {
    streak: { count, capped: streak.capped === true, kept, broken: duty.broken },
    caption,
    freezes: duty.freezes,
    heldNote: duty.heldNote,
    fullDay,
    settles: duty.settles,
    fullNote: duty.fullNote,
    aside: duty.aside,
    yesterdayOpen,
  };
}
