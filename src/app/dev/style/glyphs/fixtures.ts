/**
 * /dev/style/glyphs fixtures (ui-motion.md §9.1, lane M0a): which motion
 * each glyph plays in the gallery, and made-up props for every composite.
 * Every figure here is made up. Pure data; nothing reads the user's roadmap.
 */
import type { GlyphMotion } from "@/lib/glyph-motion";
import type { GlyphName } from "@/components/glyph/paths";
import type { RailNode } from "@/components/glyph/RouteRail";
import type { TimeBarProps } from "@/components/glyph/TimeBar";
import type { GlyphStatProps } from "@/components/glyph/GlyphStat";
import type { PipDay } from "@/components/glyph/PipStrip";

export type GalleryLevel = "full" | "calm" | "still";
export type GalleryTheme = "night" | "vellum";
export const LEVELS: readonly GalleryLevel[] = ["full", "calm", "still"];
export const THEMES: readonly GalleryTheme[] = ["night", "vellum"];

export function levelOf(v: string | string[] | undefined): GalleryLevel | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "full" || s === "calm" || s === "still" ? s : null;
}
export function themeOf(v: string | string[] | undefined): GalleryTheme | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "night" || s === "vellum" ? s : null;
}

/** The motion a glyph's tile plays (§4.7). Static families have none: they never move. */
export function motionOfGlyph(name: GlyphName): GlyphMotion | null {
  if (name.startsWith("stage.")) return "build";
  if (name.startsWith("rank.")) return "rank-rise";
  if (name.startsWith("quest.")) return "quest-done";
  if (name === "v.unv") return null;
  if (name.startsWith("v.")) return "verdict-change";
  if (name === "pv.suggest" || name === "pv.kept" || name === "pv.pick" || name === "pv.integrity") return "pv-confirm";
  if (name === "m.lock") return "unlock";
  if (name === "m.seal") return "seal-reached";
  if (name.startsWith("intensity.")) return "bars";
  if (name === "flame") return "kindle";
  return null;
}

export const RAIL_NODES: readonly RailNode[] = [
  { n: 1, state: "REACHED", gate: "foundation", label: "Milestone 1, Foundation, reached 18 Dec 2026, 100%", title: "Foundation", aside: "100%", more: "4 Oct 2026 – 20 Dec 2026 · gives Aim rank Aspirant · reached 18 Dec 2026" },
  { n: 2, state: "REACHED", rankIndex: 2, label: "Milestone 2, reached, gave Aim rank Journeyman", title: "Risk and sizing", aside: "100%" },
  { n: 3, state: "PENDING_REACH", gate: "retained", countsFrom: "Thu", label: "Milestone 3, reached, counts from Thursday", title: "Retained, part 1", more: "Reached on Tuesday; it counts from Thursday, once its reviews hold." },
  { n: 4, state: "CURRENT", pct: 23, label: "Milestone 4, current, 23%", title: "Execution", aside: "23%" },
  { n: 5, state: "PAST_DUE", label: "Milestone 5, past due", title: "Journal review" },
  { n: 6, state: "CLOSED_UNREACHED", closedPct: 82, label: "Milestone 6, closed at 82%, not reached", title: "Backtests" },
  { n: 7, state: "OUTLINE", label: "Milestone 7, outline, Gemini suggestion, not checked", title: "Fluent, part 1", meta: "Gemini · not checked" },
  { n: 8, state: "PLANNED", label: "Milestone 8, planned", title: "Fluent" },
  { n: 9, state: "LATER", label: "Milestone 9, later", title: "Mastered, part 1" },
  { n: 10, state: "HELD", held: "rest", label: "Milestone 10, held, rest", title: "On hold" },
  { n: 11, state: "DROPPED", label: "Milestone 11, dropped", title: "Paper trading" },
  { n: 12, state: "SLIPPED", label: "Milestone 12, slipped", title: "Mastered" },
];

export const STRIP_NODES: readonly RailNode[] = [
  { n: 1, state: "REACHED", gate: "foundation", label: "Milestone 1, reached" },
  { n: 2, state: "CURRENT", pct: 23, label: "Milestone 2, current, 23%" },
  { n: 3, state: "PLANNED", label: "Milestone 3, planned" },
  { n: 4, state: "PLANNED", label: "Milestone 4, planned" },
  { n: 5, state: "LATER", label: "Milestone 5, later" },
  { n: 6, state: "LATER", label: "Milestone 6, later" },
];

export const TIMEBARS: readonly { name: string; props: Omit<TimeBarProps, "labelledBy"> }[] = [
  {
    name: "realistic only",
    props: { today: "2026-10-05", realistic: { day: "2028-03-12", label: "Mar 2028", sentence: "Realistic: about March 2028, an estimate.", estimate: true } },
  },
  {
    name: "earliest, exam and your date (three rows)",
    props: {
      today: "2026-10-05",
      realistic: { day: "2028-03-12", label: "Mar 2028", sentence: "Realistic: about March 2028, an estimate, best case.", estimate: true, bestCase: true },
      earliest: { day: "2027-12-01", label: "earliest Dec 27", sentence: "Earliest if every review passes: December 2027." },
      exam: { day: "2027-05-04", label: "4 May 27 · Retained", sentence: "The exam on 4 May 2027 is a waypoint at Retained (level 8)." },
      mine: { day: "2027-12-31", label: "31 Dec 27 · yours", sentence: "Your date: 31 December 2027." },
      verdict: "OVER",
    },
  },
];

export const STATS: readonly GlyphStatProps[] = [
  { glyph: "ev.estimate", value: 9, unit: "h", label: "seen", estimate: true },
  { glyph: "pv.you", value: 10, unit: "h/wk", label: "yours" },
  { glyph: "s-know", value: 96, unit: "cards" },
  { glyph: "stage.familiar", value: 29, label: "at L6+" },
];
export const STATS_CALIBRATING: readonly GlyphStatProps[] = [
  { glyph: "quest.add", value: 3, label: "new/wk" },
  { glyph: "ev.tested", value: "", calibrating: { n: 12, need: 30 }, bestCase: true },
  { glyph: "m.queue", value: 92, unit: "%", label: "cleared" },
];

export const PIP_DAYS: readonly PipDay[] = [
  { key: "Mon", n: 0, past: true },
  { key: "Tue", n: 1, past: true },
  { key: "Wed", n: 2, today: true },
  { key: "Thu", n: 0 },
  { key: "Fri", n: 0 },
  { key: "Sat", n: 1 },
  { key: "Sun", n: 0 },
];
