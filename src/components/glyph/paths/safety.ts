/**
 * Honesty and safety (ui-motion.md §4.4, D11). Static at every level:
 * <symbol>s in GlyphDefs. glyph-motion never plays a safe.* glyph.
 *
 *   safe.health  Not medical advice     a bandage (a rounded rect at 45° with a pad and 4 dots);
 *                                       distinct from h-sick and s-duty
 *   safe.strike  avoid (an overlay)     one diagonal stroke over the row's own sess.* glyph; never alone.
 *                                       No pill shape anywhere: a pill reads as medication advice.
 *   safe.in      can include            the kit's i-check, reused
 *   safe.ask     waiting on your answer a circle with "?"
 *   m.quote      from your words        a double quote mark
 *   m.verbatim   shown exactly as written  quote marks with a small lock
 *   m.policy     the app's policy        a ruler
 *   m.judge      yours to judge          a balance scale
 *   m.nopay      pays nothing            the hex-nut outline struck through (ink, not --mp)
 *   m.clash      may clash with your aim two arrows meeting head-on
 */
import { P, U, circ, type Part } from "./part";

export const SAFETY_NAMES = ["safe.health", "safe.strike", "safe.in", "safe.ask", "m.quote", "m.verbatim", "m.policy", "m.judge", "m.nopay", "m.clash"] as const;
export type SafetyName = (typeof SAFETY_NAMES)[number];

/** The strike overlay (also drawn over a struck sess.* glyph). */
export const STRIKE = "M4.5 19.5L19.5 4.5";

export const SAFETY: Readonly<Record<SafetyName, () => Part[]>> = {
  "safe.health": () => [
    P("M9.975 18.975L18.975 9.975A3.5 3.5 0 0 0 14.025 5.025L5.025 14.025A3.5 3.5 0 0 0 9.975 18.975z", "rim"),
    P("M12 10l2 2-2 2-2-2z", "mark"),
    P(circ(12, 11.1, 0.45) + circ(12.9, 12, 0.45) + circ(12, 12.9, 0.45) + circ(11.1, 12, 0.45), "solid", { fill: true }),
  ],
  "safe.strike": () => [P(STRIKE, "mark")],
  "safe.in": () => [U("i-check", "mark")],
  "safe.ask": () => [P(circ(12, 12, 8.5), "rim"), P("M9.7 9.6a2.4 2.4 0 1 1 3.3 2.2c-.6.3-1 .8-1 1.5v.5M12 16.6v.01", "mark")],
  "m.quote": () => [P("M5 17.5V14c0-3.6 1.4-5.8 4.2-6.7M5 14h4v3.5H5zM13 17.5V14c0-3.6 1.4-5.8 4.2-6.7M13 14h4v3.5h-4z", "mark")],
  "m.verbatim": () => [
    P("M4 11.5V9.3c0-2.4 1-3.9 3-4.5M4 9.3h3v2.2H4zM10 11.5V9.3c0-2.4 1-3.9 3-4.5M10 9.3h3v2.2h-3z", "mark"),
    P("M14.5 15h5a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V16a1 1 0 0 1 1-1zM15.5 15v-1.3a1.5 1.5 0 0 1 3 0V15", "rim"),
  ],
  "m.policy": () => [P("M3.5 16.5l13-13 4 4-13 13z", "rim"), P("M7 13l1.8 1.8M10 10l1.2 1.2M13 7l1.8 1.8", "mark")],
  "m.judge": () => [P("M12 4.5v15M8 19.5h8M5.5 7.5h13", "rim"), P("M5.5 7.5L3 13a2.5 2.5 0 0 0 5 0zM18.5 7.5L16 13a2.5 2.5 0 0 0 5 0z", "mark")],
  "m.nopay": () => [P("M12 3.3l7.5 4.35v8.7L12 20.7l-7.5-4.35v-8.7z", "rim"), P(circ(12, 12, 2.6), "mark"), P(STRIKE, "badge")],
  "m.clash": () => [P("M3 12h6.5M21 12h-6.5", "rim"), P("M6.8 9l2.8 3-2.8 3M17.2 9l-2.8 3 2.8 3", "mark")],
};
