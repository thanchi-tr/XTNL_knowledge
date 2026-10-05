/**
 * Misc (ui-motion.md §4.4; §4.3 absorbs RoadmapGlyph's minus, down, info,
 * route). Animatable (inline).
 *
 *   m.link       counts toward another quota       a chain link
 *   m.builds     builds on the previous stage      two nodes joined by a link
 *   m.lock       still needs your check (D5: its ONLY meaning)  a padlock; the shackle is its own part (unlock)
 *   m.seal       reached (counted)                 a notched circle with a check
 *   m.queue      the share of the queue cleared    a tray with two stacked cards (neutral; no verdict meaning)
 *   m.pause      pause an animation                two bars; only on the WAIT pause button
 *   intensity.*  Light / Steady / Push              three rising bars, 1 / 2 / 3 of them solid (the % stays beside)
 *   route        the aim route                     two stops and a winding path
 *   route.weave  drafting                          the route in ink-2 with two strands crossing it; static shape,
 *                                                  no dash; breathes in opacity only (glyph.css, §5.7)
 *   m.minus, m.down, m.info                         existing
 */
import { P, circ, type Part } from "./part";

export const MISC_NAMES = [
  "m.link",
  "m.builds",
  "m.lock",
  "m.seal",
  "m.queue",
  "m.pause",
  "intensity.light",
  "intensity.steady",
  "intensity.push",
  "route",
  "route.weave",
  "m.minus",
  "m.down",
  "m.info",
] as const;
export type MiscName = (typeof MISC_NAMES)[number];

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const ROUTE = "M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8";
function sealNotches(): string {
  let d = "";
  for (let i = 0; i < 6; i++) {
    const a = ((-90 + 60 * i) * Math.PI) / 180;
    d += `M${r3(12 + 8 * Math.cos(a))} ${r3(12 + 8 * Math.sin(a))}L${r3(12 + 10 * Math.cos(a))} ${r3(12 + 10 * Math.sin(a))}`;
  }
  return d;
}
const bar = (x: number, y: number, h: number): string => `M${x} ${y}h3v${h}h-3z`;
function intensity(n: number): Part[] {
  return [bar(4.5, 14.5, 4.5), bar(10.5, 10.5, 8.5), bar(16.5, 6, 13)].map((d, i) => P(d, "mark", i < n ? { i, fs: true } : { i }));
}

export const MISC: Readonly<Record<MiscName, () => Part[]>> = {
  "m.link": () => [P("M10 14l4-4", "mark"), P("M8.6 11.4l-2.1 2.1a3 3 0 0 0 4.2 4.2l2.1-2.1M15.4 12.6l2.1-2.1a3 3 0 0 0-4.2-4.2l-2.1 2.1", "rim")],
  "m.builds": () => [P(circ(6.5, 17.5, 2.5) + circ(17.5, 6.5, 2.5), "rim"), P("M8.4 15.6l7.2-7.2", "mark")],
  "m.lock": () => [
    P("M6.5 11h11a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-6.5A1.5 1.5 0 0 1 6.5 11z", "rim"),
    P("M8 11V8.5a4 4 0 0 1 8 0V11", "mark", { cls: "mg-shackle" }),
    P("M12 14.8v2.2", "badge"),
  ],
  "m.seal": () => [P(circ(12, 12, 8), "rim"), P(sealNotches(), "mark"), P("M8.5 12.2l2.4 2.4 4.6-4.8", "badge")],
  "m.queue": () => [P("M3.5 14h4.5l1.2 2h5.6l1.2-2h4.5v4.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z", "rim"), P("M6.5 11V5.5h11V11M9 8h6", "mark")],
  "m.pause": () => [P("M9 6.5v11M15 6.5v11", "mark")],
  "intensity.light": () => intensity(1),
  "intensity.steady": () => intensity(2),
  "intensity.push": () => intensity(3),
  route: () => [P(circ(6, 18, 2.2) + circ(18, 6, 2.2), "rim"), P(ROUTE, "mark")],
  "route.weave": () => [P(ROUTE, "mark", { tone: "2" }), P("M3 9.5c3 2.6 6 2.6 9 0s6-2.6 9 0M3 14.5c3-2.6 6-2.6 9 0s6 2.6 9 0", "rim")],
  "m.minus": () => [P("M5.5 12h13", "mark")],
  "m.down": () => [P("M6 9.5l6 6 6-6", "mark")],
  "m.info": () => [P(circ(12, 12, 8.5), "rim"), P("M12 11v5.5M12 7.6v.01", "mark")],
};
