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
import { AttributeRadar, MasteryCard, ReadyCallout } from "@/components/home/SheetSections";
import { StatusPanel } from "@/components/home/StatusPanel";
import { capitalPanelOf, statusPanelOf } from "@/lib/status-panel";
import { loadCapitalDeals } from "@/lib/status-panel-server";
import { loadAvatar } from "@/lib/avatar-server";
import { loadSkills } from "@/lib/competency-server";
import { addAvatarTarget, archiveAvatarTarget, editAvatarTarget, logAvatarReading } from "@/app/actions/avatar";
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
import { loadWallet } from "@/lib/credits-server";
import { MomentsPull } from "@/components/today/MomentumCard";

export const metadata: Metadata = { title: "Character" };

/** The Edit avatar sheet's writes (blueprint P4): the server actions, passed to the client sheet. */
const AVATAR_ACTIONS = { addAvatarTarget, editAvatarTarget, archiveAvatarTarget, logAvatarReading };

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
 * with its track edges, title, level meter, purse), the Status card directly
 * under it (blueprint P1: the five attributes, Vitality, Intellect, Craft,
 * Duty and Care, read from the life tracks and Knowledge, and Capital as a
 * reading only; it replaced the Life tracks card; P4: each attribute's avatar
 * targets under it, and the Edit avatar sheet; P5: each attribute's skills
 * counted, linking You › Skills; P16: the purse's Credits line once credits
 * count), the 13-trait radar below
 * it, the streak and the Full day (moved off Today: life measures that span
 * the sections, day-cards.ts), the ready callout, and goals and mastery. The
 * one place material shows by default, because everything on it was earned.
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
  // So do the won Deals the Status card's Capital reading counts (a reading only: a failed read shows no Capital row).
  const monthRead = loadMonthDoneCore(userId, monthKeyOf(today)).catch(() => null);
  const capitalRead = loadCapitalDeals(userId, today).catch(() => null);
  // The avatar's targets (blueprint P4) on the same won deals, so they are read once: a failed read shows no targets.
  const avatarRead = capitalRead.then((deals) => loadAvatar(userId, now, { deals })).catch(() => null);
  // The skills (blueprint P5), counted on the Status rows: a failed read counts none.
  const skillsRead = loadSkills(userId, { fields: false }).catch(() => null);
  // The credits wallet (blueprint P16), the purse's Credits line: {live: false} with no read while CREDITS_LAUNCH_DAY is
  // not in force (no line), and a failed read shows none.
  const walletRead = loadWallet(userId, now).catch(() => null);
  const [s, board, streak] = await Promise.all([loadSheet(userId, now), loadTodayBoard(userId, today, now).catch(() => null), getDailyStreak(userId).catch(() => null)]);
  const month = await monthRead;
  const deals = await capitalRead;
  const avatar = await avatarRead;
  const skills = await skillsRead;
  const wallet = await walletRead;
  const day = dayCardsOrNull(board, streak);
  // The five attributes from the sheet's own life view and Knowledge row: the levels the hero counts; each with its
  // targets and its skills counted.
  const status = statusPanelOf(s.life, s.knowledge, avatar, skills ? skills.skills : null);
  const capital = deals ? capitalPanelOf(deals, today) : null;
  const launched = s.life.launched;

  return (
    <>
      <ShellTitle eyebrow="You" title="Character" />
      <MomentsPull when={settled.wrote} />
      {/* The order of weight: the level (the hero, the full width, first), then the five attributes and the 13 traits, then the day. */}
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
            credits={wallet?.live ? { balance: wallet.balance, today: wallet.today } : null}
            mastered={s.mastered}
            owned={s.owned}
            poolSize={s.poolSize}
          />
        </div>
        <div className="you-stack">
          <StatusPanel panel={status} capital={capital} avatar={avatar ? { view: avatar, today, actions: AVATAR_ACTIONS } : null} />
          <AttributeRadar radar={s.radar} hasGhost={s.hasGhost} top={s.top} life={{ launched, contributes: s.life.contributions.length > 0 }} />
          {day && <DayCards view={day} />}
          {s.ready && <ReadyCallout ready={s.ready} balance={s.balance} />}
          {s.lifeNote && <LifeNote />}
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
