import type { Metadata } from "next";
import { cookies } from "next/headers";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/user";
import { maybeMaintainLife } from "@/lib/settlement";
import { IDEA_MASTERY_POINTS } from "@/lib/mastery";
import { recordTodaySnapshot } from "@/lib/snapshot";
import { todayKey } from "@/lib/life-day";
import { MASTERY_LEVEL } from "@/lib/xp";
import { AIM_PROMPT_COOKIE, type AimCardView } from "@/lib/roadmap-types";
import { aimPromptOf, longGoalSeedOf } from "@/lib/roadmap-invite";
import { loadAimCard } from "@/lib/roadmap-server";
import { freezeWeekQuests } from "@/lib/roadmap-quests-server";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { CharacterHero } from "@/components/home/CharacterHero";
import { LifeNote } from "@/components/home/LifeNote";
import { lifeMpCell } from "@/components/home/sheet-math";
import { AttributeRadar, LifeTracks, MasteryCard, ReadyCallout } from "@/components/home/SheetSections";
import { AimCard } from "@/components/roadmap/AimCard";
import { loadSheet } from "./_lib/sheet";
import { loadMonthDoneCore } from "@/lib/task-style-server";
import { monthKeyOf } from "@/lib/task-style";
import { MonthDoneCard } from "@/components/task-style/MonthDoneCard";

export const metadata: Metadata = { title: "Character" };

// Levels, balance and ownership change on every review and unlock.
export const dynamic = "force-dynamic";

/**
 * The Aim card's view, or null. A failed load renders the sheet without the
 * card (roadmap F16 seam 9), never an error page; a throw before the first
 * await is caught the same way. loadAimCard is cached and reads only stored
 * rows; it catches a missing roadmap table itself (isMissingRoadmapTable).
 */
async function aimCardOrNull(userId: string, now: Date): Promise<AimCardView | null> {
  try {
    return await loadAimCard(userId, now);
  } catch (err) {
    console.error("[you] aim card unavailable", err);
    return null;
  }
}

/**
 * You › Sheet (final-you.html): the hero (crest with its track edges, title,
 * level meter, purse), the Aim card (final-aim-card.html: the aim, its Aim
 * rank and Proficiency, the current milestone and one week quests line), the
 * ready callout, life tracks, the attribute radar, and goals and mastery.
 * The one place material shows by default, because everything on it was
 * earned.
 *
 * The Aim card loads with the sheet in one wave, with no Suspense and no
 * skeleton, so nothing shifts in under the hero (loading.tsx is unchanged:
 * the swap from it to the page is a replacement, not a shift).
 *
 * Revision 4 (roadmap-rev4.md F-R4-1, F-R4-2): with no aim, the card asks for
 * one in place. The page reads the three things it needs from what it already
 * loads, with no new read: the prompt (roadmap-invite aimPromptOf: the
 * AIM_PROMPT_COOKIE snooze and LifeSettings.aimSuggestions, which R4's
 * loadAimCard selects onto the view), the long-goal seed (longGoalSeedOf over
 * the sheet's own goal ladder, s.goals) and the last aim's line (the view's
 * lastAim, from the latest DONE roadmap). The aim never travels in a URL.
 */
export default async function YouSheetPage() {
  const now = new Date();
  const userId = getCurrentUserId();
  // Set once the Aim card is read: this life week's quest set is not frozen yet (F14's fallback).
  let questWeekUnfrozen = false;
  // After the response, nothing here waits on either: today's Field snapshot (so a week from
  // now the radar and Knowledge have a real "7 days ago"), then life's one maintenance chain
  // (settle any day that is due, then judge the weeks, then the roadmap step; idempotent, single
  // flight, and it writes only on a server allowed to write). A kept week's Seal plays on the
  // next load. Last, when this render found the week's quests unfrozen and the chain's own
  // roadmap step did not freeze them, the fallback freeze (source RENDER): an insert that does
  // nothing when a row exists, gated by lifeWritesEnabled inside, never failing the render.
  after(async () => {
    try {
      await recordTodaySnapshot();
    } finally {
      await maybeMaintainLife(userId);
      if (questWeekUnfrozen) {
        try {
          // The writer never throws: a caught failure comes back as `error` (roadmap-types QuestFreezeRun).
          const frozen = await freezeWeekQuests(userId, now, "RENDER");
          if (frozen.error) console.error("[you] week quest freeze failed", frozen.error);
        } catch (err) {
          console.error("[you] week quest freeze failed", err);
        }
      }
    }
  });
  // One wave: the sheet (cached), the Aim card (cached) and the request's cookies, read on
  // the server so the "Set an aim" card never flashes in and out.
  // The month's done tasks (the "Done this month" calendar) load beside that wave; a failed read lets the card read it again.
  const monthRead = loadMonthDoneCore(userId, monthKeyOf(todayKey(now))).catch(() => null);
  const [s, aim, jar] = await Promise.all([loadSheet(userId, now), aimCardOrNull(userId, now), cookies()]);
  const month = await monthRead;
  questWeekUnfrozen = aim?.questWeekUnfrozen === true;
  // The life day the card's dates are read against, from the same `now` the loaders used: the
  // client component never falls back to its own clock, so the server render and hydration agree
  // across the 04:00 turn ("measured 09:12", "by 31 Mar", the year).
  const aimToday = todayKey(now);
  // The empty card's state (F-R4-1): ASK (the full card), LATER (the line, for 4 weeks after "Not
  // now"), HIDDEN (for 4 weeks after the line's own × or Not now on Today's line: nothing, or
  // only a last aim's line; the fix round's 'hide:<day>') or OFF (nothing but a last aim's line: "Don't suggest this", the
  // Settings switch, or a legacy 'off' cookie). promptDismissed stays the alias for OFF only.
  const prompt = aimPromptOf(jar.get(AIM_PROMPT_COOKIE)?.value, aim?.aimSuggestions ?? null, aimToday);
  // "Start from your long goal": the sheet's own goal ladder, no new read.
  const seed = longGoalSeedOf(s.goals, aimToday);
  const launched = s.life.launched;

  return (
    <>
      <ShellTitle eyebrow="You" title="Character" />
      <div className="you-grid">
        <div className="you-stack">
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
          {aim && <AimCard view={aim} prompt={prompt} seed={seed} lastAim={aim.lastAim ?? null} promptDismissed={prompt === "OFF"} today={aimToday} />}
          {s.ready && <ReadyCallout ready={s.ready} balance={s.balance} />}
          {s.lifeNote && <LifeNote />}
          <LifeTracks knowledge={s.knowledge} life={s.life} />
          <MonthDoneCard today={aimToday} initial={month && month.ok ? month.value : null} />
        </div>
        <div className="you-stack">
          <AttributeRadar radar={s.radar} hasGhost={s.hasGhost} top={s.top} life={{ launched, contributes: s.life.contributions.length > 0 }} />
          <MasteryCard
            ladder={s.goals}
            launched={launched}
            today={s.today}
            mastered={s.mastered}
            tiers={s.tiers}
            rungs={s.rungs}
            pays={{ points: IDEA_MASTERY_POINTS, level: MASTERY_LEVEL }}
          />
        </div>
      </div>
    </>
  );
}
