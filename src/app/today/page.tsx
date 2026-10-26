import type { Metadata } from "next";
import "@/components/task-style/task-style.css";
import "@/components/mind/mind.css";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/user";
import { todayKey, weekdayOf } from "@/lib/life-day";
import { autoCompleteStudyTasks, loadTodayBoard, recordDayOpen } from "@/lib/tasks";
import { boardClock, unrecordedStudyTasks, weekQuestsShownOnToday } from "@/lib/today-board";
import { getDailyStreak } from "@/lib/streak";
import { loadBossStates } from "@/lib/bosses";
import { loadNotifications } from "@/lib/notifications";
import { isLaunched } from "@/lib/life-economy";
import { maybeMaintainLife, settleForStreak } from "@/lib/settlement";
import { loadWeightView } from "@/lib/weight-server";
import { freezeWeekQuests, loadTodayNamedTitles, loadWeekQuests } from "@/lib/roadmap-quests-server";
import { loadMainQuestCard, loadMainQuestWeek } from "@/lib/main-quest-server";
import { mainQuestOf } from "@/lib/main-quest";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { longDate } from "@/components/shell/nav";
import { TodayBoard } from "@/components/today/TodayBoard";
import { DueElsewhere } from "@/components/today/DueElsewhere";
import { dueElsewhereOf, questsOpenOf, weighInDueOf } from "@/components/today/due-elsewhere";
import { NamedMark } from "@/components/glyph/NamedMark";
import { MainQuestCard } from "@/components/today/MainQuestCard";
import { mainQuestCardOf } from "@/components/today/main-quest-card";
import { isBoardId, workBoardHref } from "@/lib/work-boards";
import { loadMomentum, settleMomentum } from "@/lib/momentum-server";
import { creditTagsOn } from "@/lib/credits";
import { loadNextWeek } from "@/lib/week-calibration-server";
import { NextWeekCard } from "@/components/home/NextWeekCard";
import { loadMindView } from "@/lib/mind-server";
import { CheckInSlot } from "@/components/mind/CheckInSlot";

// The board turns on the clock (a 04:00 day edge, a ten-minute undo window)
// and on every tick — never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Today" };

/**
 * Tasks › Today (the three sections: Ideas, Tasks, Body). The board shows the
 * tasks due today and nothing else; what is due in the other two sections is
 * one slim strip of links out (due-elsewhere.ts): reviews due, this week's
 * sprint rows still open and the encounters ready (Ideas, /review, where
 * the review quest, the week quests, the aim line and the encounters live
 * now), and a weigh-in not yet logged (Body, /train). The streak and the
 * Full day are Character's (/you).
 *
 * Blueprint P15 (D11): the Main quest card sits in the side column above the
 * goals (its key results): the main quest (main-quest-server
 * loadMainQuestCard: the lowest seat whose milestone is under way, else the
 * lowest open seat; cached), its milestone, its own sprint this week
 * (loadMainQuestWeek) and one action. Start stays on the roadmap page,
 * offered only while ROADMAP_GOALS_LIVE is on.
 *
 * Blueprint P32 (D36): on Mondays the week's calibration card sits above it
 * (week-calibration-server loadNextWeek: Today's three sizes, the capacity
 * suggestion and the one-tap suggestions), headed "This week". Null at once
 * while AUDIT_LAUNCH_DAY is not in force, and on every other day no read.
 *
 * The check-in (health-2026-10-27.md D3): a slim "Check in" row under the
 * strip that opens the check-in sheet, while check-ins are open (mind-server
 * loadMindView: before MIND_LAUNCH_DAY it answers live: false at once and
 * reads nothing), the table is there and they aren't paused. Only that
 * yes or no reaches the board: no count, no value.
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // A work tab asked for by the query (/today?board=<id>, an old call back reminder's tap URL; work-boards.ts) is its own
  // page: /today/work/<id>, with any other parameter (callback) kept. Nothing below is read for it.
  const query = await searchParams;
  const boardParam = typeof query.board === "string" ? query.board : null;
  if (boardParam && isBoardId(boardParam)) {
    const rest = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (k !== "board" && typeof v === "string") rest.set(k, v);
    const q = rest.toString();
    redirect(`${workBoardHref(boardParam)}${q ? `?${q}` : ""}`);
  }
  const now = new Date();
  const userId = getCurrentUserId();
  const day = todayKey(now);

  // Momentum (momentum.md §A.1, §E.1): its lazy writes first (the day's quest set, a past day's ready chest, a
  // milestone or checkpoint reached), so the board's read below prices today's frog and the card reads them.
  // Before MOMENTUM_LAUNCH_DAY, or on a server that only reads, it returns at once and writes nothing; it never throws.
  const settled = await settleMomentum(userId, day, { now });
  // The streak multiplier (blueprint P29): while it is in force, Duty's lazy settle too, before the board's read, so the
  // rows project the d their ticks pay (it is counted back from the settlement cursor). Before the user's go, and once
  // the day is settled, it returns at once; it never throws.
  await settleForStreak(userId, now);

  // One wave: the board's own read (templates, recent instances, the day's
  // ledger, the queue size, and each open ROADMAP goal's stored series —
  // cached per life day), the streak (the day's moments, Record yesterday's
  // honesty), the notification feed the Tasks Asks read (the same cached feed
  // as the top bar's bell), and, for the strip only, the ready encounters,
  // this life week's quests (roadmap F17: one cached indexed row once the
  // week is frozen; a failure or a missing table reads as none) and the Body
  // section's day (the weight card's own cached read; it fails soft to the
  // empty view). All cached; a warm load costs nothing.
  // The live fix (contracts §22.11, ruling 67): each plan-born title's Gemini-named Domain names, so Today marks them.
  // Started with the wave (cached per life day; a failure reads as none) and awaited after it.
  const namedTitlesLoad = loadTodayNamedTitles(userId, now).catch(() => ({}) as Record<string, string[]>);
  // P32: the week's calibration, Mondays only (started with the wave, awaited after it; a failure reads as none).
  const nextWeekLoad = weekdayOf(day) === 1 ? loadNextWeek(userId, now).catch(() => null) : Promise.resolve(null);
  // The check-in row (D3): started with the wave, awaited after it (cached; nothing read before launch; a failure reads as no row).
  const mindLoad = loadMindView(userId, now).catch(() => null);
  const [board, streak, bosses, feed, quests, weight, momentum, questCard] = await Promise.all([
    loadTodayBoard(userId, day, now),
    getDailyStreak(userId),
    loadBossStates(userId).catch(() => []),
    loadNotifications(userId, now).catch(() => null),
    loadWeekQuests(userId, now).catch(() => null),
    loadWeightView(userId, now).catch(() => null),
    // {live: false} before launch (no read at all); a failure reads as no card.
    loadMomentum(userId, day, { now }).catch(() => null),
    // The Main quest (P15): its Aim card (loadAimCards, cached per life day; it writes nothing); a failure reads as no card.
    loadMainQuestCard(userId, now).catch(() => null),
  ]);
  const namedTitles = await namedTitlesLoad;
  const nextWeek = await nextWeekLoad;
  const mind = await mindLoad;
  const checkInOpen = mind != null && mind.live && mind.ready && !mind.paused;

  // Writes a render may owe, after the response and only when owed: the
  // day's first open fixes the quest's target, and a study task the day's
  // reviews have already satisfied gets its (0 XP) completion recorded.
  const needsDayOpen = board.ledger.today.dayOpenQty === null;
  const studyToRecord = unrecordedStudyTasks(board) > 0;
  if (needsDayOpen || studyToRecord) {
    after(async () => {
      if (needsDayOpen) await recordDayOpen(userId, board.dueNow ?? 0, now);
      if (studyToRecord) await autoCompleteStudyTasks(userId, now);
    });
  }

  // Roadmap F14: this week's quest set, frozen once (INSERT … ON CONFLICT DO
  // NOTHING). The life cron freezes it just after Monday 04:00; a render that
  // finds none (a failed cron) freezes it after the response, in its own
  // after(). An empty, held or past-due week is frozen too. freezeWeekQuests
  // writes only where life writes are on and never throws; a writes-off
  // server shows the live set, labelled, and schedules nothing.
  if (quests && !quests.frozen && !quests.view.writesOff) {
    after(() => freezeWeekQuests(userId, now, "RENDER"));
  }

  // Life maintenance, its own after(), never awaited by the render (M2 F5,
  // decision 4): daily settlement first (Duty's lazy, idempotent judging of
  // days ≤ today − 2), then the M5 week judge, in one single-flight chain.
  // maybeMaintainLife writes nothing before Duty's launch, with life writes
  // off (lifeWritesEnabled, the shared database) or while the settlement
  // cursor is null, returns at once when nothing is behind, and never throws.
  after(() => maybeMaintainLife(userId));

  // The date lives in the top bar (the life day's own date, which between
  // midnight and 04:00 is still the day before, and says so). The clock
  // below keeps time and prints its zone on purpose: a wrong zone would
  // silently shift every day edge in the app, and this is where it shows.
  const clock = boardClock(now);

  // The one strip: what Ideas and Body have due today, from the reads above. Hidden when nothing is (no rows).
  const elsewhere = dueElsewhereOf({
    reviewsDue: board.dueNow ?? null,
    questsOpen: quests && weekQuestsShownOnToday(quests.view) ? questsOpenOf(quests.view) : 0,
    bossesReady: bosses.filter((b) => b.availability.status === "ready").length,
    weighInDue: weighInDueOf(weight),
  });

  // The Main quest (P15): its own goal's sprint this week (the strip's lowest-seat set when it is that one, else that
  // goal's cached read; mainQuestOf still matches the milestone). A failed read is no sprint, never another goal's.
  const questWeek = await loadMainQuestWeek(userId, now, questCard, quests?.view ?? null).catch(() => null);
  const mainQuest = mainQuestOf(questCard, questWeek, day);
  const mainQuestView = questCard ? mainQuestCardOf(mainQuest, questWeek?.rows ?? null) : null;
  // Credits (blueprint P16): the Quest sheet's price tags, from the model in force today (no read). Null while
  // CREDITS_LAUNCH_DAY is not in force, so the card is exactly as before.
  const credits = creditTagsOn(day);

  return (
    <>
      <ShellTitle eyebrow={clock.lateNight ? "Today · until 04:00" : "Today"} title={longDate(board.today)} />
      <TodayBoard
        data={board}
        streak={streak}
        nowIso={now.toISOString()}
        notices={feed?.notices ?? []}
        footClock={{ time: clock.time, zone: clock.zone, tz: clock.tz }}
        launched={isLaunched(day)}
        elsewhere={elsewhere.length > 0 ? <DueElsewhere rows={elsewhere} /> : null}
        checkIn={checkInOpen ? <CheckInSlot /> : null}
        mainQuest={mainQuestView ? <MainQuestCard view={mainQuestView} /> : null}
        nextWeek={nextWeek ? <NextWeekCard view={nextWeek} title="This week" headingId="nw-today-h" /> : null}
        namedTitles={Object.keys(namedTitles).length > 0 ? { names: namedTitles, mark: <NamedMark /> } : null}
        momentum={momentum?.live ? momentum : null}
        momentumSettled={settled.wrote}
        credits={credits}
      />
    </>
  );
}
