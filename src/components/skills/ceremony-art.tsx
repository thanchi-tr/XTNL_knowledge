"use client";

/**
 * The emblem art and backdrop for the unlock Ascension (T3), for L3's
 * AscensionCurtain to render in its art and backdrop slots.
 *
 *   <CeremonyArt art={event.facts.art} size={168}/>
 *       emblem → the EmblemCoin (rank-material rim, depth notches) around
 *       SkillLogo animated={false}; crest → the Crest at its band.
 *   <CeremonyBackdrop event={event}/>
 *       The attribute sky band behind the emblem (a still tableau in every
 *       motion level). On the player's FIRST emblem at depth 13, 14 or 15, and
 *       only in Full motion, the Cataclysm variant plays over it once
 *       (lazy-loaded with its CSS; it is fixed and pointer-events:none, so
 *       the curtain's content must sit above z-index 16).
 *   markCataclysm(eventId)   the unlock flow flags an event as a first-of-depth unlock
 *   wantsCataclysm(event)    whether the backdrop will play it
 *
 * Nothing here is random: the Cataclysm variant is chosen by the emblem's
 * attribute (cataclysm-variants.ts) and its geometry is deterministic.
 */
import dynamic from "next/dynamic";
import type { Attribute } from "@prisma/client";
import type { CelebrationArt, CelebrationEvent } from "@/lib/celebration-types";
import { themeFor } from "@/lib/attribute-themes";
import { motionLevel } from "@/lib/motion";
import { getSkill } from "@/lib/skill-pool";
import { Crest, EmblemCoin } from "@/components/ui/Crest";
import { SkillLogo } from "./SkillLogo";

const Cataclysm = dynamic(() => import("./Cataclysm").then((m) => m.Cataclysm), { ssr: false });

const flagged = new Set<string>();

/** Called by the unlock flow before enqueue, for a first-of-depth (13–15) unlock. */
export function markCataclysm(eventId: string): void {
  flagged.add(eventId);
}

export function wantsCataclysm(event: Pick<CelebrationEvent, "id" | "facts">): boolean {
  const art = event.facts.art;
  return art?.type === "emblem" && art.depth >= 13 && flagged.has(event.id);
}

export function CeremonyArt({ art, size = 168 }: { art: CelebrationArt | undefined; size?: number }) {
  if (!art) return null;
  if (art.type === "crest") return <Crest level={art.level} material={art.material} size={size} />;
  if (art.type !== "emblem") return null;
  const skill = getSkill(art.code);
  if (!skill) return null;
  return (
    <EmblemCoin rank={art.rank} depth={art.depth} size={size}>
      <SkillLogo skill={skill} size={Math.round(size * 0.56)} animated={false} />
    </EmblemCoin>
  );
}

function attributeOf(event: Pick<CelebrationEvent, "facts">): Attribute | null {
  const art = event.facts.art;
  if (art?.type !== "emblem") return null;
  return getSkill(art.code)?.attributes[0] ?? null;
}

export function CeremonyBackdrop({ event }: { event: Pick<CelebrationEvent, "id" | "facts"> }) {
  const attribute = attributeOf(event);
  const hue = attribute ? themeFor(attribute).color : "#f0c75e";
  const art = event.facts.art;
  const skill = art?.type === "emblem" ? getSkill(art.code) : undefined;
  const play = skill !== undefined && wantsCataclysm(event) && motionLevel() === "full";
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, ${hue} 28%, transparent), transparent 70%)`,
        }}
      />
      {play && skill && <Cataclysm skill={skill} replayKey={1} />}
    </>
  );
}
