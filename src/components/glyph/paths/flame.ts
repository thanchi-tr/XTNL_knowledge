/**
 * Flame (ui-motion.md §4.4; phase 3, for streak surfaces; not the review
 * combo). Animatable (inline, kindle).
 *
 *   idle    flame.unlit  the i-flame path as an outline, ink-mute at 1.5
 *   active  flame.lit    filled currentColor
 *   done    flame.kept   filled, with its core cut out in --card
 *
 * The kit's i-flame symbol is fill-only (stroke="none" on the path), so an
 * outline cannot reuse it through <use>: this is the one glyph that carries
 * a kit path, by spec (glyph-check allowlists it, with this reason).
 */
import { P, type GlyphState, type Part } from "./part";

export const FLAME_NAMES = ["flame"] as const;
export type FlameName = (typeof FLAME_NAMES)[number];
/** The catalogue's three flame names are the flame's three states. */
export const FLAME_ALIAS = { "flame.unlit": "idle", "flame.lit": "active", "flame.kept": "done" } as const;
export type FlameAlias = keyof typeof FLAME_ALIAS;

export const FLAME_PATH = "M12.2 2.5c.6 3-1 4.8-2.6 6.6C8 10.9 6.5 12.6 6.5 15.4a5.5 5.5 0 0 0 11 0c0-2.1-.9-3.7-1.9-5-.3 1.3-1 2.3-2 2.8.6-3.6-.2-7.9-1.4-10.7z";
const CORE = "M12 18.5a2.2 2.2 0 0 1-2.2-2.2c0-1.4 1.1-2.3 2.2-3.6 1.1 1.3 2.2 2.2 2.2 3.6a2.2 2.2 0 0 1-2.2 2.2z";

export function flameParts(state: GlyphState): Part[] {
  if (state === "idle") return [P(FLAME_PATH, "rim", { tone: "m", sw: 1.5 })];
  if (state === "active") return [P(FLAME_PATH, "solid", { fill: true })];
  return [P(FLAME_PATH, "solid", { fill: true }), P(CORE, "mark", { core: true, cls: "mg-core" })];
}
