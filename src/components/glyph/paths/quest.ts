/**
 * Quest kinds (ui-motion.md §4.4), drawn by KindGlyph. Animatable (inline).
 *
 * The active state adds the started pip: a solid dot r 1.6 at (4.5, 19.5),
 * data-part="solid" (the "n of N" text beside says the same in words).
 *
 *   quest.bring       RAISE · tested    the kit's s-know book (reused, never copied) + an up-chevron on its right page
 *   quest.add         ADD · counted     a card outline (rect 6,4 12×16 rx 2) with a plus
 *   quest.practice    PRACTICE · ticks  the PLAN'S OWN track sigil (the kit's s-*, reused)
 *   quest.step        STEP · you tick   the stair; a 2.5 dot on the bottom / middle / top tread
 *   quest.checkpoint  CHECKPOINT · log  the target; the inner disc filled when done (also the exam marker)
 *
 * Done fills the shape (the check badge is KindGlyph's, top-right).
 */
import { P, U, circ, type GlyphState, type Part } from "./part";

export const QUEST_NAMES = ["quest.bring", "quest.add", "quest.practice", "quest.step", "quest.checkpoint"] as const;
export type QuestName = (typeof QUEST_NAMES)[number];
export type TrackSigil = "body" | "duty" | "craft" | "care" | "know";

const PIP = circ(4.5, 19.5, 1.6);
const CHEVRON = "M14.6 13.4l1.9-1.9 1.9 1.9";
const GUTTER = "M12 6.5v13";
const CARD = "M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z";
const PLUS = "M12 9v6M9 12h6";
const STAIR = "M4 19h5v-5h5V9h6";
/** The step's dot on the bottom, middle and top tread. */
export const TREADS: readonly [number, number][] = [
  [6.5, 17.3],
  [11.5, 12.3],
  [17, 7.3],
];
const TARGET = circ(12, 12, 8.5);
const BULL = circ(12, 12, 3.5);

export function questParts(name: QuestName, state: GlyphState, track: TrackSigil = "craft"): Part[] {
  const pip: Part[] = state === "active" ? [P(PIP, "solid", { fill: true, cls: "mg-pip" })] : [];
  switch (name) {
    case "quest.bring":
      if (state === "done") return [U("s-know", "rim"), U("s-know", "solid", { fill: true }), P(CHEVRON, "mark", { knock: true }), P(GUTTER, "mark", { knock: true })];
      return [U("s-know", "rim"), P(CHEVRON, "mark"), ...pip];
    case "quest.add":
      if (state === "done") return [P(CARD, "rim"), P(CARD, "solid", { fill: true }), P(PLUS, "mark", { knock: true })];
      return [P(CARD, "rim"), P(PLUS, "mark"), ...pip];
    case "quest.practice":
      if (state === "done") return [U(`s-${track}`, "rim"), U(`s-${track}`, "solid", { fill: true })];
      return [U(`s-${track}`, "rim"), ...pip];
    case "quest.step": {
      const [x, y] = TREADS[state === "done" ? 2 : state === "active" ? 1 : 0];
      return [P(STAIR, "rim"), P(circ(x, y, 1.25), "solid", { fill: true, cls: "mg-dot" })];
    }
    case "quest.checkpoint":
      if (state === "done") return [P(TARGET, "rim"), P(BULL, "mark"), P(BULL, "solid", { fill: true })];
      return [P(TARGET, "rim"), P(BULL, "mark"), ...pip];
  }
}
