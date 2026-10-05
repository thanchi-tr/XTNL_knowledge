/**
 * Session kinds (ui-motion.md §4.4). Static: <symbol>s in GlyphDefs. The
 * session name always sits beside, in the answered summary too. An avoided
 * session is its own glyph with the safe.strike overlay (Glyph's `struck`).
 *
 *   sess.easy       EASY_SESSION        a gentle wave
 *   sess.mobility   MOBILITY_SESSION    an arc arrow round a joint dot
 *   sess.technique  TECHNIQUE_SESSION   a plumb line and bob
 *   sess.harder     HARDER_SESSION      two steep chevrons
 *   sess.longer     LONGER_SESSION      a double arrow between end ticks
 *   sess.strength   STRENGTH_SESSION    a dumbbell
 *   sess.full       FULL_ATTEMPT        a peak with a summit pennant
 *   sess.perf       PERFORMANCE_CHECK   a stopwatch
 */
import { P, circ, type Part } from "./part";

export const SESSION_NAMES = ["sess.easy", "sess.mobility", "sess.technique", "sess.harder", "sess.longer", "sess.strength", "sess.full", "sess.perf"] as const;
export type SessionName = (typeof SESSION_NAMES)[number];

/** The catalog key each session glyph stands for (roadmap-catalog). */
export const SESSION_KEY: Readonly<Record<SessionName, string>> = {
  "sess.easy": "EASY_SESSION",
  "sess.mobility": "MOBILITY_SESSION",
  "sess.technique": "TECHNIQUE_SESSION",
  "sess.harder": "HARDER_SESSION",
  "sess.longer": "LONGER_SESSION",
  "sess.strength": "STRENGTH_SESSION",
  "sess.full": "FULL_ATTEMPT",
  "sess.perf": "PERFORMANCE_CHECK",
};

export const SESSION: Readonly<Record<SessionName, () => Part[]>> = {
  "sess.easy": () => [P("M3 13.5c3-3.2 6 3.2 9 0s6-3.2 9 0", "mark")],
  "sess.mobility": () => [P(circ(12, 12, 1.8), "solid", { fill: true }), P("M5.94 15.5A7 7 0 1 1 9.61 18.58", "rim"), P("M11.3 21.1L9.6 18.6l3-.9", "mark")],
  "sess.technique": () => [P("M8 3.5h8M12 3.5v10", "rim"), P("M12 13.5l2.8 3.3-2.8 3.4-2.8-3.4z", "mark")],
  "sess.harder": () => [P("M6 13l6-6 6 6M6 19.5l6-6 6 6", "mark")],
  "sess.longer": () => [P("M3.5 7.5v9M20.5 7.5v9", "rim"), P("M6.5 12h11M9.5 9l-3 3 3 3M14.5 9l3 3-3 3", "mark")],
  "sess.strength": () => [P("M7 7.5v9M17 7.5v9M4.5 10v4M19.5 10v4", "rim"), P("M7 12h10", "mark")],
  "sess.full": () => [P("M2.5 20l7-11 3.5 5 2-2.5 6.5 8.5z", "rim"), P("M9.5 9V3.5l4 1.6-4 1.6", "mark")],
  "sess.perf": () => [P(circ(12, 13.5, 7), "rim"), P("M12 13.5V9.5M10 3.5h4M12 3.5v3M17.6 7.4l1.3-1.3", "mark")],
};
