import type { Metadata } from "next";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/user";
import { IDEA_MASTERY_POINTS } from "@/lib/mastery";
import { recordTodaySnapshot } from "@/lib/snapshot";
import { MASTERY_LEVEL } from "@/lib/xp";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { CharacterHero } from "@/components/home/CharacterHero";
import { AttributeRadar, LifeTracks, MasteryCard, ReadyCallout } from "@/components/home/SheetSections";
import { loadSheet } from "./_lib/sheet";

export const metadata: Metadata = { title: "Character" };

// Levels, balance and ownership change on every review and unlock.
export const dynamic = "force-dynamic";

/**
 * You › Sheet (final-you.html): the hero (crest, title, level meter, purse),
 * the ready callout, life tracks, the attribute radar and mastery. The one
 * place material shows by default, because everything on it was earned.
 */
export default async function YouSheetPage() {
  const userId = getCurrentUserId();
  // Today's Field snapshot, so a week from now the radar and Knowledge have a
  // real "7 days ago" to compare against. After the response: nothing here waits on it.
  after(async () => {
    await recordTodaySnapshot();
  });
  const s = await loadSheet(userId);

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
            tracks={null}
            balance={s.balance}
            mastered={s.mastered}
            owned={s.owned}
            poolSize={s.poolSize}
          />
          {s.ready && <ReadyCallout ready={s.ready} balance={s.balance} />}
          <LifeTracks knowledge={s.knowledge} />
        </div>
        <div className="you-stack">
          <AttributeRadar radar={s.radar} hasGhost={s.hasGhost} top={s.top} />
          <MasteryCard mastered={s.mastered} tiers={s.tiers} pays={{ points: IDEA_MASTERY_POINTS, level: MASTERY_LEVEL }} />
        </div>
      </div>
    </>
  );
}
