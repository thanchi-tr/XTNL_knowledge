/**
 * Provenance (ui-motion.md §4.4, D4, D25, D29). The balloon shapes mean
 * "not checked" and always sit beside the visible word "Gemini". A dash on
 * its own never means it.
 *
 * Animatable (inline, pv-confirm): the Gemini glyphs
 *   pv.suggest    a speech balloon with a dashed rim (2.4 / 2.2)
 *   pv.kept       the balloon with a solid pin inside
 *   pv.pick       three option dots, the middle one inside a small balloon outline
 *   pv.integrity  a solid-rim balloon with a check inside
 * Static (ProvMark, <symbol>s in GlyphDefs):
 *   pv.app        the kit's i-gear, reused
 *   pv.you        the edit pen (also the user's own declared figures, "yours")
 *   pv.checked    a circle with a check
 *   pv.syllabus   a scroll
 *
 * Revision 5, lane 9 (ui-motion.md §15.1, D32–D34, D38):
 *   pv.web        Gemini's name · Google linked sources: a solid-rim balloon with a meridian globe (inline)
 *   pv.libpick    Gemini picked one of your Domains · not checked: two book backs in a dashed balloon (inline)
 *   pv.library    your Domain: two book backs on a shelf line (static, provmark)
 *   pv.named      named by Gemini: the solid balloon rim alone, 12 px at stroke 2 (static, provmark)
 */
import { P, U, circ, type Part } from "./part";

export const GEMINI_PV_NAMES = ["pv.suggest", "pv.kept", "pv.pick", "pv.integrity", "pv.web", "pv.libpick"] as const;
export const PROVMARK_NAMES = ["pv.app", "pv.you", "pv.checked", "pv.syllabus", "pv.library", "pv.named"] as const;
export type GeminiPvName = (typeof GEMINI_PV_NAMES)[number];
export type ProvMarkName = (typeof PROVMARK_NAMES)[number];
export type ProvenanceName = GeminiPvName | ProvMarkName;

export const BALLOON = "M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-8l-4 3.5v-3.5H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z";
/** pathLength units: about 2.4 / 2.2 user units on the balloon's ≈ 58-unit rim. */
export const BALLOON_DASH = "4.5 3.83";
export const CHECK_IN = "M8 12.3l2.7 2.7L16 9.6";

// ── Revision 5, lane 9 (ui-motion.md §15.1) ──
/** pv.web's globe: a circle r 3.4 at (12, 11), a meridian ellipse (rx 1.5, ry 3.4) and the equator. */
export const WEB_GLOBE = `${circ(12, 11, 3.4)}M12 7.6a1.5 3.4 0 1 1 0 6.8a1.5 3.4 0 1 1 0-6.8zM8.6 11h6.8`;
/** pv.library's two upright book backs, of two heights so they read as books, not as a pause. */
export const LIBRARY_BOOKS = "M6 5.5h3.6v13H6zM11 7.5h3.6v11H11z";
export const LIBRARY_SHELF = "M4 20h16";
/** pv.libpick's two small book backs inside the balloon. */
export const LIBPICK_BOOKS = "M9 8.5h2.2v5.5H9zM12.6 8.5h2.2v5.5h-2.2z";

export const PROVENANCE: Readonly<Record<ProvenanceName, () => Part[]>> = {
  "pv.suggest": () => [P(BALLOON, "rim", { dash: BALLOON_DASH })],
  "pv.kept": () => [P(BALLOON, "rim", { dash: BALLOON_DASH }), P(circ(12, 9.8, 1.7), "solid", { fill: true }), P("M12 11.5v2.4", "mark")],
  "pv.pick": () => [
    P("M9.5 7.2h5a1 1 0 0 1 1 1v4.3a1 1 0 0 1-1 1h-2l-2 2v-2h-1a1 1 0 0 1-1-1V8.2a1 1 0 0 1 1-1z", "rim", { dash: "5 3.33" }),
    P(circ(4.5, 10.3, 1.3) + circ(12, 10.3, 1.2) + circ(19.5, 10.3, 1.3), "solid", { fill: true }),
  ],
  "pv.integrity": () => [P(BALLOON, "rim"), P("M8.8 11.2l2.2 2.2 4.2-4.4", "mark")],
  "pv.app": () => [U("i-gear", "rim")],
  "pv.you": () => [P("M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4", "mark")],
  "pv.checked": () => [P(circ(12, 12, 8.5), "rim"), P(CHECK_IN, "mark")],
  "pv.syllabus": () => [P("M6.5 4.5h10a2 2 0 0 1 2 2v13h-10a2 2 0 0 1-2-2zM6.5 17.5a2 2 0 0 0-2 2h4", "rim"), P("M10 8.5h5M10 11.5h5", "mark")],
  // ── Revision 5, lane 9 ──
  "pv.web": () => [P(BALLOON, "rim"), P(WEB_GLOBE, "mark")],
  "pv.libpick": () => [P(BALLOON, "rim", { dash: BALLOON_DASH }), P(LIBPICK_BOOKS, "mark")],
  "pv.library": () => [P(LIBRARY_BOOKS, "rim"), P(LIBRARY_SHELF, "mark")],
  "pv.named": () => [P(BALLOON, "rim", { sw: 2 })],
};
