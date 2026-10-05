/**
 * Rank: the notched medallion (ui-motion.md §4.4, D5), drawn by RankSeal.
 * Animatable (inline). Ink only; no padlock anywhere ("kept for good" is words).
 *
 *   rim      circle r 10
 *   notch i  (i < index) a radial tick r 6.2 → 8.2 at −90° + 60°·i; one per rank above Initiate,
 *            so Paragon closes the ring. The held notches are ONE path (≤ 6 paths per glyph), so
 *            rank-rise pops them together.
 *   centre   Initiate a filled dot (r 1.3); Aspirant…Virtuoso a hex outline (r 2.6);
 *            Paragon a filled hex and a rim of 2.25
 *
 *   idle    not reached / beyond the plan's top / Paragon on a draft: ink-mute rim, slots as dots, no centre
 *   active  the next rank ("gives"): ink-2 rim, the held ticks in ink-0, the new slot an open dot
 *   done    held for good: rim and ticks in ink-0, the centre
 */
import { P, circ, r3, type GlyphState, type Part } from "./part";

export const RANK_NAMES = ["rank.0", "rank.1", "rank.2", "rank.3", "rank.4", "rank.5", "rank.6"] as const;
export type RankName = (typeof RANK_NAMES)[number];
/** The Aim ranks, Initiate (0) … Paragon (6); the same words as roadmap-types AIM_RANKS (glyph-check asserts it). */
export const RANK_WORDS = ["Initiate", "Aspirant", "Journeyman", "Specialist", "Expert", "Virtuoso", "Paragon"] as const;

const ang = (i: number): number => ((-90 + 60 * i) * Math.PI) / 180;
const notch = (i: number): string => {
  const c = Math.cos(ang(i));
  const s = Math.sin(ang(i));
  return `M${r3(12 + 6.2 * c)} ${r3(12 + 6.2 * s)}L${r3(12 + 8.2 * c)} ${r3(12 + 8.2 * s)}`;
};
const slotAt = (i: number, r: number): string => circ(12 + 7.2 * Math.cos(ang(i)), 12 + 7.2 * Math.sin(ang(i)), r);
const hex = (r: number): string => {
  let d = "";
  for (let k = 0; k < 6; k++) d += `${k ? "L" : "M"}${r3(12 + r * Math.cos(ang(k)))} ${r3(12 + r * Math.sin(ang(k)))}`;
  return `${d}z`;
};
const RIM = circ(12, 12, 10);

function notches(n: number): string {
  let d = "";
  for (let i = 0; i < n; i++) d += notch(i);
  return d;
}
function slots(from: number): string {
  let d = "";
  for (let i = from; i < 6; i++) d += slotAt(i, 0.85);
  return d;
}

/** rank.N in a state; N is clamped to 0…6. */
export function rankParts(index: number, state: GlyphState): Part[] {
  const N = Math.max(0, Math.min(6, Math.round(index)));
  if (state === "idle") return [P(RIM, "rim", { tone: "m" }), P(slots(0), "badge", { fill: true, tone: "m" })];
  if (state === "active") {
    const out: Part[] = [P(RIM, "rim", { tone: "2" })];
    if (N >= 2) out.push(P(notches(N - 1), "mark", { tone: "0" }));
    // the open slot: the new notch's place, or the centre for Initiate
    out.push(P(N >= 1 ? slotAt(N - 1, 1.15) : circ(12, 12, 1.3), "ring", { sw: 1.25, tone: "0", cls: "mg-slot" }));
    const rest = slots(Math.max(N, 0));
    if (rest) out.push(P(rest, "badge", { fill: true, tone: "m" }));
    return out;
  }
  const out: Part[] = [P(RIM, "rim", N === 6 ? { sw: 2.25 } : {})];
  if (N > 0) out.push(P(notches(N), "mark"));
  const rest = slots(N);
  if (rest) out.push(P(rest, "badge", { fill: true, tone: "m" }));
  if (N === 0) out.push(P(circ(12, 12, 1.3), "solid", { fill: true }));
  else out.push(P(hex(2.6), "solid", N === 6 ? { fs: true } : {}));
  return out;
}
