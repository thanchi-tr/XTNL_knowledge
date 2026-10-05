/**
 * The glyph part model (ui-motion.md §4.1). Pure data: every family file
 * returns Part[] for a name and a state; Glyph.tsx and GlyphDefs.tsx render
 * them, glyph-check reads them.
 *
 * Grammar: a 24 × 24 box; currentColor only; round caps and joins (glyph.css);
 * every stroked path carries pathLength=100 and a data-part; fills only on
 * a filled part (fill="currentColor", stroke none). No filter, gradient,
 * mask or text. ≤ 6 paths.
 */

export type GlyphState = "idle" | "active" | "done";
export const GLYPH_STATES: readonly GlyphState[] = ["idle", "active", "done"];

/** What a part is for; the motions select parts by it. */
export type PartRole = "rim" | "mark" | "solid" | "badge" | "ring" | "ping";
export const PART_ROLES: readonly PartRole[] = ["rim", "mark", "solid", "badge", "ring", "ping"];

/** An ink step for a part that differs from the glyph's own (rank slots in ink-mute, the weave route in ink-2). */
export type Tone = "0" | "2" | "m";

export interface PathPart {
  t: "p";
  d: string;
  part: PartRole;
  /** Filled in currentColor, no stroke. */
  fill?: boolean;
  /** Filled and stroked (the Paragon hex, a solid intensity bar). */
  fs?: boolean;
  /** Knocked out: stroked in --card over a filled layer. */
  knock?: boolean;
  /** Filled in --card (the flame's core), no stroke. */
  core?: boolean;
  /** A dash in pathLength units (only the balloon family, v.unv and the pending rail node are dashed). */
  dash?: string;
  /** Stroke width override, from {1.25, 1.5, 1.75, 2, 2.25}. */
  sw?: number;
  tone?: Tone;
  /** Order inside a staggered motion (stones bottom-up, bars left to right). */
  i?: number;
  /** An mg-* hook for a motion (mg-shackle, mg-dot, mg-pip, mg-slot). */
  cls?: string;
}

/** A kit sprite symbol reused as a part (i-gear, i-clock, i-check, s-know …): one source, never a copy. */
export interface UsePart {
  t: "u";
  href: string;
  part: PartRole;
  fill?: boolean;
  i?: number;
  cls?: string;
}

export interface GroupPart {
  t: "g";
  tf: string;
  kids: Part[];
}

export type Part = PathPart | UsePart | GroupPart;

export const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** A circle as a path that starts at 12 o'clock and runs clockwise, so a draw (dashoffset 100 → 0) starts at the top. */
export const circ = (cx: number, cy: number, r: number): string =>
  `M${r3(cx)} ${r3(cy - r)}a${r} ${r} 0 1 1 0 ${r3(2 * r)}a${r} ${r} 0 1 1 0 ${r3(-2 * r)}z`;

export const P = (d: string, part: PartRole, x: Partial<Omit<PathPart, "t" | "d" | "part">> = {}): PathPart => ({ t: "p", d, part, ...x });
export const U = (href: string, part: PartRole, x: Partial<Omit<UsePart, "t" | "href" | "part">> = {}): UsePart => ({ t: "u", href, part, ...x });
export const G = (tf: string, kids: Part[]): GroupPart => ({ t: "g", tf, kids });

/** The static here-ring: circle r 11, stroke 1.25 (the active cue when a glyph stands alone). */
export const HERE_RING = circ(12, 12, 11);
/** The active state's inner scale: the glyph at .8 inside the here-ring. */
export const ACTIVE_TF = "translate(2.4 2.4) scale(.8)";
/** The done state's inner scale: the glyph at .8, bottom-left, leaving the corner to the check badge. */
export const DONE_TF = "translate(0 4.8) scale(.8)";
/** The done check badge (top-right). */
export const DONE_CHECK = "M15.5 4l2.3 2.3L22 2";

/**
 * The house states for a glyph with no bespoke ones (§4.1):
 *   idle   the outline (ink-2 by glyph.css)
 *   active the outline at .8 inside the static here-ring (a shape cue, never colour alone)
 *   done   the outline at .8 plus a check badge
 */
export function withState(base: Part[], state: GlyphState): Part[] {
  if (state === "active") return [G(ACTIVE_TF, base), P(HERE_RING, "ring", { sw: 1.25 })];
  if (state === "done") return [G(DONE_TF, base), P(DONE_CHECK, "badge")];
  return base;
}

/** Every path part, flattened out of groups (glyph-check counts and inspects these). */
export function flatParts(parts: Part[]): (PathPart | UsePart)[] {
  const out: (PathPart | UsePart)[] = [];
  for (const p of parts) {
    if (p.t === "g") out.push(...flatParts(p.kids));
    else out.push(p);
  }
  return out;
}
