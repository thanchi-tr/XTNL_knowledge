/**
 * Layer: the topic map's layers (ui-motion.md §15.1; roadmap revision 5,
 * lane 9). Animatable (inline; `layer-open` reaches it).
 *
 *   A funnel of 6 stacked bars narrowing downward, layer 1 at the top the widest.
 *   Bar centres at y = 3.5, 6.9, 10.3, 13.7, 17.1, 20.5; half-widths 9, 7.6, 6.2, 4.8, 3.4, 2 on x 12.
 *   The five bars other than k: one `rim` path of five round-capped strokes.
 *   Bar k: a capsule 2.6 high over its bar's width; its outline is the `mark`, its fill the `solid`,
 *   in every state, so "which layer" never depends on state.
 *
 *   idle    ink-2 at 1.5 (a future layer, "after k", held); ink-mute when locked (the caller's class)
 *   active  ink-0, the bars at .8 inside the static here-ring (the cairn's active cue)
 *   done    ink-0 at 1.75, the bars at .8 bottom-left, plus the check badge top-right
 *
 * Never dashed (D34): a locked layer is ink-mute with m.builds beside it, never m.lock, never struck.
 */
import { ACTIVE_TF, DONE_CHECK, DONE_TF, G, HERE_RING, P, r3, type GlyphState, type Part } from "./part";

export const LAYER_NAMES = ["layer.1", "layer.2", "layer.3", "layer.4", "layer.5", "layer.6"] as const;
export type LayerName = (typeof LAYER_NAMES)[number];

/** The bars' centres, top (layer 1) to bottom (layer 6). */
export const LAYER_BAR_Y: readonly number[] = [3.5, 6.9, 10.3, 13.7, 17.1, 20.5];
/** The bars' half-widths, on x 12. */
export const LAYER_BAR_HW: readonly number[] = [9, 7.6, 6.2, 4.8, 3.4, 2];
/** Bar k's capsule height. */
export const LAYER_CAPSULE_H = 2.6;

/** One bar as a single horizontal stroke. */
const barStroke = (i: number): string => `M${r3(12 - LAYER_BAR_HW[i])} ${LAYER_BAR_Y[i]}h${r3(2 * LAYER_BAR_HW[i])}`;

/** Bar i as a capsule (rounded ends of radius h/2) over its bar's width. */
export function layerCapsule(i: number): string {
  const r = LAYER_CAPSULE_H / 2;
  const x0 = 12 - LAYER_BAR_HW[i];
  const w = 2 * LAYER_BAR_HW[i];
  const y0 = LAYER_BAR_Y[i] - r;
  return `M${r3(x0)} ${r3(y0)}h${r3(w)}a${r} ${r} 0 0 1 0 ${LAYER_CAPSULE_H}h${r3(-w)}a${r} ${r} 0 0 1 0 ${-LAYER_CAPSULE_H}z`;
}

/** The layer a name stands for (1..6). */
export function layerOfName(name: LayerName): number {
  return Number(name.slice(6));
}

/** The glyph name for layer k (clamped to 1..6). */
export function layerGlyphOf(k: number): LayerName {
  const n = Math.max(1, Math.min(6, Math.round(Number.isFinite(k) ? k : 1)));
  return `layer.${n}` as LayerName;
}

/** layer.k's parts in a state: ≤ 4 paths (rim, mark, solid, and a ring or a badge). */
export function layerParts(name: LayerName, state: GlyphState): Part[] {
  const k = layerOfName(name) - 1;
  const rim = LAYER_BAR_Y.map((_, i) => i)
    .filter((i) => i !== k)
    .map(barStroke)
    .join("");
  const cap = layerCapsule(k);
  if (state === "active") {
    return [G(ACTIVE_TF, [P(rim, "rim"), P(cap, "mark"), P(cap, "solid", { fill: true })]), P(HERE_RING, "ring", { sw: 1.25 })];
  }
  if (state === "done") {
    return [G(DONE_TF, [P(rim, "rim", { sw: 1.75 }), P(cap, "mark", { sw: 1.75 }), P(cap, "solid", { fill: true })]), P(DONE_CHECK, "badge")];
  }
  return [P(rim, "rim"), P(cap, "mark"), P(cap, "solid", { fill: true })];
}
