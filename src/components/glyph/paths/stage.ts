/**
 * Stage: the cairn (ui-motion.md §4.4). Stones = level. Animatable (inline).
 *
 *   stone(w, y) = M(12−w/2) y q(w/2) −3 w 0 q−(w/2) 2.2 −w 0 z
 *   stones bottom-up at (16, 19.5) (13, 15.5) (10, 11.5) (7, 7.5); the orb is a circle at (12, 3.6), r 1.6
 *
 *   idle    the outline (future)
 *   active  the outline at .8 inside the static here-ring (current)
 *   done    stones and orb filled (held, counted)
 *
 * stage.toward(gate): the gate's cairn, its top stone only its top arc ("Toward X").
 * stage.part(gate):   the gate's cairn, the right half of its top stone left off ("X, part n").
 * stage.track(n):     n stones (track plans STAGE_1…5); the 5th is the orb.
 */
import { ACTIVE_TF, G, HERE_RING, P, circ, r3, type GlyphState, type Part } from "./part";

export type StageGate = "foundation" | "familiar" | "retained" | "fluent" | "mastered";
export const STAGE_GATES: readonly StageGate[] = ["foundation", "familiar", "retained", "fluent", "mastered"];
/** Pieces per gate (the 5th piece is the orb). */
export const GATE_PIECES: Readonly<Record<StageGate, number>> = { foundation: 1, familiar: 2, retained: 3, fluent: 4, mastered: 5 };
export const GATE_LEVEL: Readonly<Record<StageGate, number>> = { foundation: 4, familiar: 6, retained: 8, fluent: 10, mastered: 12 };

export const STAGE_NAMES = ["stage.foundation", "stage.familiar", "stage.retained", "stage.fluent", "stage.mastered", "stage.toward", "stage.part", "stage.track"] as const;
export type StageName = (typeof STAGE_NAMES)[number];

const STONES: readonly [number, number][] = [
  [16, 19.5],
  [13, 15.5],
  [10, 11.5],
  [7, 7.5],
];

export const stone = (w: number, y: number): string => `M${r3(12 - w / 2)} ${y}q${r3(w / 2)} -3 ${w} 0q${r3(-w / 2)} 2.2 ${-w} 0z`;
const stoneTop = (w: number, y: number): string => `M${r3(12 - w / 2)} ${y}q${r3(w / 2)} -3 ${w} 0`;
const stoneHalf = (w: number, y: number): string => {
  const x0 = 12 - w / 2;
  return `M${r3(x0 + w / 2)} ${r3(y - 1.5)}Q${r3(x0 + w / 4)} ${r3(y - 1.5)} ${r3(x0)} ${y}Q${r3(x0 + w / 4)} ${r3(y + 1.1)} ${r3(x0 + w / 2)} ${r3(y + 1.1)}z`;
};
const ORB = circ(12, 3.6, 1.6);
const ORB_TOP = "M10.4 3.6a1.6 1.6 0 0 1 3.2 0";
const ORB_HALF = "M12 2a1.6 1.6 0 0 0 0 3.2z";

/** The cairn: n pieces (1–5), a variant on the top piece, in a state. */
export function cairn(n: number, variant: "toward" | "part" | null, state: GlyphState): Part[] {
  const count = Math.max(1, Math.min(5, Math.round(n)));
  const pieces: Part[] = [];
  const solid: string[] = [];
  for (let i = 0; i < count; i++) {
    const top = i === count - 1;
    let d: string;
    if (i === 4) d = top && variant === "toward" ? ORB_TOP : top && variant === "part" ? ORB_HALF : ORB;
    else {
      const [w, y] = STONES[i];
      d = top && variant === "toward" ? stoneTop(w, y) : top && variant === "part" ? stoneHalf(w, y) : stone(w, y);
    }
    pieces.push(P(d, "mark", { i }));
    if (!(top && variant === "toward")) solid.push(d);
  }
  if (state === "active") return [G(ACTIVE_TF, pieces), P(HERE_RING, "ring", { sw: 1.25 })];
  if (state === "done") return [...pieces, P(solid.join(""), "solid", { fill: true })];
  return pieces;
}

export interface StageOpts {
  gate?: StageGate;
  n?: number;
}

export function stageParts(name: StageName, state: GlyphState, o: StageOpts = {}): Part[] {
  switch (name) {
    case "stage.toward":
      return cairn(GATE_PIECES[o.gate ?? "familiar"], "toward", state);
    case "stage.part":
      return cairn(GATE_PIECES[o.gate ?? "familiar"], "part", state);
    case "stage.track":
      return cairn(o.n ?? 1, null, state);
    default:
      return cairn(GATE_PIECES[name.slice(6) as StageGate], null, state);
  }
}

/** The cairn for a level (4 → foundation … 12 → mastered); null below 4. */
export function gateOfLevel(level: number): StageGate | null {
  let best: StageGate | null = null;
  for (const g of STAGE_GATES) if (level >= GATE_LEVEL[g]) best = g;
  return best;
}
