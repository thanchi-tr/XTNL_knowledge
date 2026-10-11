import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/user";
import { maybeMaintainLife } from "@/lib/settlement";
import { IDEA_MASTERY_POINTS } from "@/lib/mastery";
import { recordTodaySnapshot } from "@/lib/snapshot";
import { todayKey } from "@/lib/life-day";
import { MASTERY_LEVEL } from "@/lib/xp";
import { loadTodayBoard } from "@/lib/tasks";
import type { BoardData } from "@/lib/today-board";
import { getDailyStreak, type DailyStreak } from "@/lib/streak";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { CharacterHero } from "@/components/home/CharacterHero";
import { LifeNote } from "@/components/home/LifeNote";
import { lifeMpCell } from "@/components/home/sheet-math";
import { AttributeRadar, LifeTracks, MasteryCard, ReadyCallout } from "@/components/home/SheetSections";
import { DayCards } from "@/components/home/DayCards";
import { dayCardsOf, type DayCardsView } from "@/components/home/day-cards";
import { Glyph } from "@/components/glyph/Glyph";
import { Icon } from "@/components/ui/Icon";
import { ROADMAP_HREF } from "@/components/roadmap/roadmap-links";
import { loadSheet } from "./_lib/sheet";
import { loadMonthDoneCore } from "@/lib/task-style-server";
import { monthKeyOf } from "@/lib/task-style";
import { MonthDoneCard } from "@/components/task-style/MonthDoneCard";
import { settleMomentum } from "@/lib/momentum-server";
import { MomentsPull } from "@/components/today/MomentumCard";

export const metadata: Metadata = { title: "Character" };

// Levels, balance and ownership change on every review and unlock.
export const dynamic = "force-dynamic";

/**
 * The streak and the Full day, or null. They read Today's own cached board and the daily streak (the page's one
 * wave, each read caught to null); a missing read or a failure here renders the sheet without them, never an error
 * page.
 */
function dayCardsOrNull(board: BoardData | null, streak: DailyStreak | null): DayCardsView | null {
  if (!board || !streak) return null;
  try {
    return dayCardsOf(board, streak);
  } catch (err) {
    console.error("[you] day cards unavailable", err);
    return null;
  }
}

/**
 * You › Character (final-you.html), opened from the profile menu (the three
 * sections: Ideas, Tasks, Body; the game layer lives here): the hero (crest
 * with its track edges, title, level meter, purse), the attribute radar, the
 * streak and the Full day (moved off Today: life measures that span the
 * sections, day-cards.ts), the ready callout, life tracks, and goals and
 * mastery. The one place material shows by default, because everything on
 * it was earned.
 *
 * The roadmap's Aim card lives in Ideas › Roadmap now; the sheet keeps one
 * quiet link to it (the tour's "Give the character an aim" target).
 *
 * The day cards load with the sheet in one wave, with no Suspense and no
 * skeleton, so nothing shifts in under the hero (loading.tsx is unchanged:
 * the swap from it to the page is a replacement, not a shift).
 */
export default async function YouSheetPage() {
  const now = new Date();
  const userId = getCurrentUserId();
  // After the response, nothing here waits on either: today's Field snapshot (so a week from
  // now the radar and Knowledge have a real "7 days ago"), then life's one maintenance chain
  // (settle any day that is due, then judge the weeks, then the roadmap step; idempotent, single
  // flight, and it writes only on a server allowed to write). A kept week's Seal plays on the
  // next load.
  after(async () => {
    try {
      await recordTodaySnapshot();
    } finally {
      await maybeMaintainLife(userId);
    }
  });
  // The life day the cards' dates are read against, from the same `now` the loaders used: a client
  // component never falls back to its own clock, so the server render and hydration agree across
  // the 04:00 turn.
  const today = todayKey(now);
  // Momentum's lazy writes (momentum.md §A.1: the day's quest set, a past day's ready chest, a milestone or a
  // checkpoint reached) before the sheet reads its XP and MP; their persisted moments are pulled once on arrival.
  // Before MOMENTUM_LAUNCH_DAY, or on a server that only reads, it returns at once and writes nothing; it never throws.
  const settled = await settleMomentum(userId, today, { now });
  // One wave: the sheet (cached) and the day cards' reads (Today's cached board and the streak; a failure reads as none).
  // The month's done tasks (the "Done this month" calendar) load beside that wave; a failed read lets the card read it again.
  const monthRead = loadMonthDoneCore(userId, monthKeyOf(today)).catch(() => null);
  const [s, board, streak] = await Promise.all([loadSheet(userId, now), loadTodayBoard(userId, today, now).catch(() => null), getDailyStreak(userId).catch(() => null)]);
  const month = await monthRead;
  const day = dayCardsOrNull(board, streak);
  const launched = s.life.launched;

  return (
    <>
      <ShellTitle eyebrow="You" title="Character" />
      <MomentsPull when={settled.wrote} />
      {/* The order of weight: the level (the hero, the full width, first), then the attributes, then the day. */}
      <div className="you-grid">
        <div className="you-hero">
          <CharacterHero
            level={s.level}
            progress={s.progress}
            title={s.title}
            epithet={s.epithet}
            transcendent={s.transcendent}
            dominant={s.dominant}
            distance={s.distance}
            tracks={s.life.edges}
            lifeMp={launched ? lifeMpCell(s.life.mpLastWeek, s.today) : null}
            balance={s.balance}
            mastered={s.mastered}
            owned={s.owned}
            poolSize={s.poolSize}
          />
        </div>
        <div className="you-stack">
          <AttributeRadar radar={s.radar} hasGhost={s.hasGhost} top={s.top} life={{ launched, contributes: s.life.contributions.length > 0 }} />
          {day && <DayCards view={day} />}
          {s.ready && <ReadyCallout ready={s.ready} balance={s.balance} />}
          {s.lifeNote && <LifeNote />}
          <LifeTracks knowledge={s.knowledge} life={s.life} />
        </div>
        <div className="you-stack">
          <MonthDoneCard today={today} initial={month && month.ok ? month.value : null} />
          <MasteryCard
            ladder={s.goals}
            launched={launched}
            today={s.today}
            mastered={s.mastered}
            tiers={s.tiers}
            rungs={s.rungs}
            pays={{ points: IDEA_MASTERY_POINTS, level: MASTERY_LEVEL }}
          />
          {/* The aim and its roadmap live in Ideas › Roadmap; one quiet way there from the character. */}
          <div className="card you-aim-link" data-tour="you-aim">
            <Link className="collapsed" href={ROADMAP_HREF}>
              <Glyph name="route" size={20} inherit />
              <b>Aim and roadmap</b>
              <Icon name="chev" size={16} className="ink-2" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
