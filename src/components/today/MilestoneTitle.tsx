import { StruckLabel } from "@/components/roadmap/StruckLabel";
import { TitleClassChip } from "@/components/roadmap/ProvenanceChip";
import type { TextClass } from "@/lib/roadmap-types";

/** A milestone's head and title as the Main quest surfaces carry them (main-quest-card.ts, the review's Sprint step). */
export interface MilestoneTitleView {
  /** "Milestone 2 of 6" (lib/main-quest milestoneHeadOf). */
  head: string;
  /** The title as written ("" when it has none): its struck spans index into it. */
  title: string;
  titleClass: TextClass | null;
  titleStruck: [number, number][];
}

/**
 * "Milestone 2 of 6 · <title>" as every Main quest surface draws it (blueprint P15, contracts §22.11): the title's
 * numbers struck where a Gemini title has them (StruckLabel, never rewritten) and Gemini's words with their chip
 * (TitleClassChip: "Gemini suggestion · not checked", "Gemini's words · kept by you · not checked"), as the Aim card
 * does. The user's and the app's titles carry none. The chip's look is today.css .mq-pv (Today and the review do not
 * load roadmap.css). No hooks: a server or a client parent may render it.
 */
export function MilestoneTitle({ m }: { m: MilestoneTitleView }) {
  const gemini = m.titleClass === "DRAFT" || m.titleClass === "KEPT_SUGGESTION";
  return (
    <>
      {m.head}
      {m.title && (
        <>
          {" · "}
          <StruckLabel label={m.title} struck={m.titleStruck} />
        </>
      )}
      {gemini && (
        <>
          {" "}
          <TitleClassChip cls={m.titleClass} className="mq-pv" />
        </>
      )}
    </>
  );
}
