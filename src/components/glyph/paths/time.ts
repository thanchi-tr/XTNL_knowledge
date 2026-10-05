/**
 * Time and pace (ui-motion.md §4.4). Ink, static: <symbol>s in GlyphDefs.
 *
 *   t.cal         a date set by the app            the calendar
 *   t.cal-moved   the app's date moved             the calendar plus an arrow (→ later; n = −1: ← earlier)
 *   t.pin         your own date                    a map pin outline; always with the word "yours"
 *   t.earliest    earliest if every review passes  a thin tick with an open ring head (a ghost marker; not dashed)
 *   t.span        the review gap                   an arc jumping between two short ticks; always with "review gap"
 *   t.hourglass   set by reviews                   an hourglass
 *   pace.on       on pace                          a straight arrow (ink)
 *   pace.behind   behind                           an arrow with a broken shaft (ink, never red)
 */
import { P, circ, type Part } from "./part";

export const TIME_NAMES = ["t.cal", "t.cal-moved", "t.pin", "t.earliest", "t.span", "t.hourglass", "pace.on", "pace.behind"] as const;
export type TimeName = (typeof TIME_NAMES)[number];

const CAL_HOOKS = "M8.5 3.5v4M15.5 3.5v4";

export function timeParts(name: TimeName, n?: number): Part[] {
  switch (name) {
    case "t.cal":
      return [P("M6 5.5h12a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2zM4 10h16", "rim"), P(CAL_HOOKS, "mark")];
    case "t.cal-moved":
      return [
        P("M11 20H6a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V12M4 10h16", "rim"),
        P(CAL_HOOKS, "mark"),
        P(n != null && n < 0 ? "M20.5 16.5h-7M16 14l-2.5 2.5L16 19" : "M13.5 16.5h7M18 14l2.5 2.5L18 19", "badge"),
      ];
    case "t.pin":
      return [P("M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z", "rim"), P(circ(12, 10, 2.3), "mark")];
    case "t.earliest":
      return [P("M12 20.5V10.5", "mark", { sw: 1.25 }), P(circ(12, 7.5, 3), "rim", { sw: 1.25 })];
    case "t.span":
      return [P("M5 19v-4M19 19v-4", "rim"), P("M5.5 13.5C7 6.5 17 6.5 18.5 13.5", "mark")];
    case "t.hourglass":
      return [P("M7 3.5h10M7 20.5h10", "rim"), P("M8 3.5c0 4.5 8 4 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 4-8 8.5s8 4 8 8.5", "mark")];
    case "pace.on":
      return [P("M4 12h15M14 7l5 5-5 5", "mark")];
    case "pace.behind":
      return [P("M4 12h5M12.5 12H19M14 7l5 5-5 5", "mark")];
  }
}
