/**
 * A moment's art at 44 px for the Moments shelf: the crest, the medallion or
 * the emblem the event names (CelebrationArt), else a medallion in the
 * event's material with its numeral.
 */
import type { CelebrationEvent } from "@/lib/celebration-types";
import { getSkill } from "@/lib/skill-pool";
import { Crest, EmblemCoin, Medallion } from "@/components/ui/Crest";
import { SkillLogo } from "@/components/skills/SkillLogo";

export function MomentArt({ event, size = 44 }: { event: CelebrationEvent; size?: number }) {
  const art = event.facts.art;
  if (art?.type === "crest") return <Crest level={art.level} material={art.material} size={size} />;
  if (art?.type === "emblem") {
    const skill = getSkill(art.code);
    if (skill) {
      return (
        <EmblemCoin rank={art.rank} depth={art.depth} size={size}>
          <SkillLogo skill={skill} size={Math.round(size * 0.56)} animated={false} />
        </EmblemCoin>
      );
    }
  }
  if (art?.type === "medallion") return <Medallion material={art.material} numeral={art.numeral} size={size} />;
  return <Medallion material={event.facts.material ?? "iron"} numeral={event.facts.numeral?.to ?? null} size={size} />;
}
