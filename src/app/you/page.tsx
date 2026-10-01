import type { Metadata } from "next";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/user";
import { maybeJudgeWeeks } from "@/lib/life-weeks-server";
import { IDEA_MASTERY_POINTS } from "@/lib/mastery";
import { recordTodaySnapshot } from "@/lib/snapshot";
import { MASTERY_LEVEL } from "@/lib/xp";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { CharacterHero } from "@/components/home/CharacterHero";
import { LifeNote } from "@/components/home/LifeNote";
import { lifeMpCell } from "@/components/home/sheet-math";
import { AttributeRadar, LifeTracks, MasteryCard, ReadyCallout } from "@/components/home/SheetSections";
import { loadSheet } from "./_lib/sheet";

export const metadata: Metadata = { title: "Character" };

// Levels, balance and ownership change on every review and unlock.
export const dynamic = "force-dynamic";

/**
 * You › Sheet (final-you.html): the hero (crest with its track edges, title,
 * level meter, purse), the ready callout, life tracks, the attribute radar,
 * and goals and mastery. The one place material shows by default, because
 * everything on it was earned.
 */
export default async function YouSheetPage() {
  const userId = getCurrentUserId();
  // After the response, nothing here waits on either: today's Field snapshot (so a week from
  // now the radar and Knowledge have a real "7 days ago"), then the lazy week judge (idempotent;
  // it writes only once life counts, on a server allowed to write). A kept week's Seal plays on
  // the next load.
  after(async () => {
    try {
      await recordTodaySnapshot();
    } finally {
      await maybeJudgeWeeks(userId);
    }
  });
  const s = await loadSheet(userId);
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
          {s.ready && <ReadyCallout ready={s.ready} balance={s.balance} />}
          {s.lifeNote && <LifeNote />}
          <LifeTracks knowledge={s.knowledge} life={s.life} />
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
