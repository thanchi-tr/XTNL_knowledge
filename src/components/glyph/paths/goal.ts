/**
 * Goal: a goal's seat (ui-motion.md §15.1; roadmap revision 5, lane 9 draws
 * them, lane 4 places them). Static: the `goal` defs family (D38), ids
 * gd-{route}-goal.k-{state}.
 *
 *   goal.1 … goal.3   three rounded seats 5 × 5 (rx 1.2) centred at x 5.5, 12, 18.5 on y 11.5;
 *                     the three outlines are the `rim`, seat k's fill the `solid`
 *   goal.paused       the three seats hollow (`rim`) and a rest line M8 17.5h8 (`mark`); distinct
 *                     from m.pause (two vertical bars) and the kit's HeldGlyph rest
 *
 *   idle    another goal: ink-2
 *   active  the goal on screen: ink-0 plus a short under-bar beneath seat k (`mark`), the family's
 *           "current" cue; goal.paused: the glyph at .8 inside the here-ring
 *   done    a DONE goal ("Other goals"): ink-0 plus the check badge (goal.paused: the gallery only)
 *
 * Never dashed (D34). A seat glyph sits beside a goal's label, as a glyph, never as text.
 */
import { ACTIVE_TF, DONE_CHECK, G, HERE_RING, P, r3, type GlyphState, type Part } from "./part";

export const GOAL_NAMES = ["goal.1", "goal.2", "goal.3", "goal.paused"] as const;
export type GoalName = (typeof GOAL_NAMES)[number];

/** The seats' centres on x (seat 1, 2, 3); all on y 11.5. */
export const SEAT_X: readonly number[] = [5.5, 12, 18.5];
export const SEAT_Y = 11.5;
const SEAT = 5;
const RX = 1.2;

/** One seat as a rounded square path centred at (cx, SEAT_Y). */
export function seatPath(cx: number): string {
  const x0 = cx - SEAT / 2;
  const y0 = SEAT_Y - SEAT / 2;
  const s = SEAT - 2 * RX;
  return `M${r3(x0 + RX)} ${r3(y0)}h${r3(s)}a${RX} ${RX} 0 0 1 ${RX} ${RX}v${r3(s)}a${RX} ${RX} 0 0 1 ${-RX} ${RX}h${r3(-s)}a${RX} ${RX} 0 0 1 ${-RX} ${-RX}v${r3(-s)}a${RX} ${RX} 0 0 1 ${RX} ${-RX}z`;
}

const ALL_SEATS = SEAT_X.map(seatPath).join("");
/** goal.paused's rest line. */
export const GOAL_REST = "M8 17.5h8";

/** goal.k's parts in a state (≤ 4 paths). */
export function goalParts(name: GoalName, state: GlyphState): Part[] {
  if (name === "goal.paused") {
    const base = [P(ALL_SEATS, "rim"), P(GOAL_REST, "mark")];
    if (state === "active") return [G(ACTIVE_TF, base), P(HERE_RING, "ring", { sw: 1.25 })];
    if (state === "done") return [...base, P(DONE_CHECK, "badge")];
    return base;
  }
  const k = Number(name.slice(5)) - 1;
  const cx = SEAT_X[k];
  const base = [P(ALL_SEATS, "rim"), P(seatPath(cx), "solid", { fill: true })];
  if (state === "active") return [...base, P(`M${r3(cx - 2)} 17h4`, "mark")];
  if (state === "done") return [...base, P(DONE_CHECK, "badge")];
  return base;
}

/** The seat glyph for a goal (slot 1..3), or goal.paused. */
export function goalGlyphOf(slot: number | null | undefined, paused = false): GoalName {
  if (paused || slot == null) return "goal.paused";
  const k = Math.max(1, Math.min(3, Math.round(slot)));
  return `goal.${k}` as GoalName;
}
