/**
 * Evidence badges (ui-motion.md §4.4). Static at every level: delivered as
 * <symbol>s in the route's GlyphDefs. ≤ 2 subpaths per path (the tally 3),
 * no feature under 3 units, so they read at 12 px on the Fold cover.
 *
 *   ev.tested    tested by your reviews   one arc and one arrowhead
 *   ev.counted   counted by the app       three tally strokes
 *   ev.tick      from your ticks          a rounded box with a check
 *   ev.log       you log it               a clipboard (board + clip)
 *   ev.estimate  estimate (≈)             two waves
 *   ev.measured  measured at (time)       the kit's i-clock, reused; only ever beside a measured time (D27)
 */
import { P, U, type Part } from "./part";

export const EVIDENCE_NAMES = ["ev.tested", "ev.counted", "ev.tick", "ev.log", "ev.estimate", "ev.measured"] as const;
export type EvidenceName = (typeof EVIDENCE_NAMES)[number];

export const EVIDENCE: Readonly<Record<EvidenceName, () => Part[]>> = {
  "ev.tested": () => [P("M18.5 12a6.5 6.5 0 1 1-1.9-4.6M17 3.8v3.8h-3.8", "mark")],
  "ev.counted": () => [P("M8 6v12M12 6v12M16 6v12", "mark")],
  "ev.tick": () => [P("M7.5 4.5h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3z", "rim"), P("M8.5 12.3l2.5 2.5 4.5-5", "mark")],
  "ev.log": () => [P("M9 5H7.5A1.5 1.5 0 0 0 6 6.5v12A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5v-12A1.5 1.5 0 0 0 16.5 5H15M9.5 3.5h5v3h-5z", "rim")],
  "ev.estimate": () => [P("M5 9.5c2.3-2 4.7 2 7 0s4.7-2 7 0M5 15c2.3-2 4.7 2 7 0s4.7-2 7 0", "mark")],
  "ev.measured": () => [U("i-clock", "rim")],
};
