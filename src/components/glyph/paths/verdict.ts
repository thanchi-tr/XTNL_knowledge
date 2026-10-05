/**
 * Verdicts (ui-motion.md §4.4, the existing RoadmapGlyph shapes). Animatable
 * (inline, verdict-change). A verdict glyph always sits beside its word and
 * only inside a verdict chip (D27). When verdictWord adds "Unverified ·",
 * the chip shows v.unv before the verdict's own glyph.
 *
 *   idle    an option not chosen
 *   active  the chosen option (the glyph at .8 inside the here-ring: a shape cue, never colour alone)
 *   done    verdicts have no done state; it renders the active shape (glyph-check knows)
 *
 *   v.fits    circle-check        v.over    triangle with !
 *   v.tight   half-filled circle  v.imp     slashed circle
 *   v.fitted  sliders             v.unv     dashed circle-check (never moves, H3)
 */
import { P, circ, type Part } from "./part";
import { CHECK_IN } from "./provenance";

export const VERDICT_NAMES = ["v.fits", "v.tight", "v.over", "v.imp", "v.fitted", "v.unv"] as const;
export type VerdictName = (typeof VERDICT_NAMES)[number];

const RING = circ(12, 12, 8.5);

export const VERDICT: Readonly<Record<VerdictName, () => Part[]>> = {
  "v.fits": () => [P(RING, "rim"), P(CHECK_IN, "mark")],
  "v.tight": () => [P(RING, "rim"), P("M12 3.5v17", "mark"), P("M12 3.5a8.5 8.5 0 0 1 0 17z", "solid", { fill: true })],
  "v.over": () => [P("M12 3.8l9 15.7H3z", "rim"), P("M12 10v4.2", "mark"), P("M12 16.9v.01", "badge")],
  "v.imp": () => [P(RING, "rim"), P("M6 6l12 12", "mark")],
  "v.fitted": () => [P("M4 8h16M4 16h16", "rim"), P("M8 5v6", "mark", { i: 0 }), P("M16 13v6", "mark", { i: 1 })],
  "v.unv": () => [P(RING, "rim", { dash: "5 5" }), P(CHECK_IN, "mark")],
};
