/**
 * Where the tour's card goes, and which part of the target it spotlights.
 * Pure (scripts/tour-check.ts runs it over a grid of targets at 344×512,
 * 375×812, 932×1024 and 1440×900).
 *
 * The guarantees, for a card no taller than cardMaxHeight(vp):
 *   - the card sits inside the viewport, MARGIN from every edge;
 *   - when any of the target is on screen there is a spotlight, inside the
 *     target (plus PAD) and inside the viewport, and the card never touches it.
 *
 * Order of preference: below the target, above, right, left. When none has
 * room (a target taller than the screen: Today's lanes on a phone), the card
 * docks to the bottom or the top and the spotlight is trimmed to the part of
 * the target the card leaves clear. That part always exists: the card's
 * height cap leaves the middle MIN_SPOT of the screen free from both docks.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  /** The spotlit box, or null when nothing of the target is on screen (the card is centred). */
  spot: Box | null;
  side: "below" | "above" | "right" | "left" | "dock-bottom" | "dock-top" | "center";
}

/** The card's distance from the viewport's edges. */
export const MARGIN = 12;
/** The gap between the card and the spotlight. */
export const GAP = 12;
/** The spotlight's padding around the target. */
export const PAD = 6;
/** The least of a tall target the spotlight keeps when it is trimmed. */
export const MIN_SPOT = 16;
/** The card's widest. */
export const CARD_MAX_W = 360;

export function cardWidth(vp: Pick<Box, "width">): number {
  return Math.max(0, Math.min(CARD_MAX_W, vp.width - 2 * MARGIN));
}

/** The tallest the card may be (it scrolls inside past this): half of what is left once margins, gaps and MIN_SPOT are out. */
export function cardMaxHeight(vp: Pick<Box, "height">): number {
  return Math.max(0, Math.floor((vp.height - 2 * MARGIN - 2 * GAP - MIN_SPOT) / 2));
}

const right = (b: Box) => b.left + b.width;
const bottom = (b: Box) => b.top + b.height;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The part of `a` inside `b`, or null. */
export function intersect(a: Box, b: Box): Box | null {
  const l = Math.max(a.left, b.left);
  const t = Math.max(a.top, b.top);
  const r = Math.min(right(a), right(b));
  const btm = Math.min(bottom(a), bottom(b));
  return r > l && btm > t ? { left: l, top: t, width: r - l, height: btm - t } : null;
}

export function overlaps(a: Box, b: Box): boolean {
  return intersect(a, b) != null;
}

/**
 * Places a card of `card` size for `target` (null: no target) in the viewport
 * `vp` (the visual viewport: left/top are its offsets in the layout viewport).
 */
export function placeCard(target: Box | null, card: { width: number; height: number }, vp: Box): Placement {
  const w = Math.min(card.width, cardWidth(vp));
  const h = Math.min(card.height, cardMaxHeight(vp));
  const L = vp.left + MARGIN;
  const T = vp.top + MARGIN;
  const R = right(vp) - MARGIN;
  const B = bottom(vp) - MARGIN;
  const centred: Placement = { left: Math.round(vp.left + (vp.width - w) / 2), top: Math.round(vp.top + (vp.height - h) / 2), spot: null, side: "center" };

  const padded = target && { left: target.left - PAD, top: target.top - PAD, width: target.width + 2 * PAD, height: target.height + 2 * PAD };
  const spot = padded && intersect(padded, vp);
  if (!spot) return centred;

  const cx = spot.left + spot.width / 2;
  const cy = spot.top + spot.height / 2;
  const hLeft = clamp(cx - w / 2, L, R - w);
  const vTop = clamp(cy - h / 2, T, B - h);
  const round = (p: Placement): Placement => ({ ...p, left: Math.round(p.left), top: Math.round(p.top) });

  if (bottom(spot) + GAP + h <= B) return round({ left: hLeft, top: bottom(spot) + GAP, spot, side: "below" });
  if (spot.top - GAP - h >= T) return round({ left: hLeft, top: spot.top - GAP - h, spot, side: "above" });
  if (right(spot) + GAP + w <= R) return round({ left: right(spot) + GAP, top: vTop, spot, side: "right" });
  if (spot.left - GAP - w >= L) return round({ left: spot.left - GAP - w, top: vTop, spot, side: "left" });

  // No side has room: dock the card and trim the spotlight to what it leaves clear.
  const need = Math.min(MIN_SPOT, spot.height);
  const atBottom = { top: B - h, clear: { lo: vp.top, hi: B - h - GAP } };
  const atTop = { top: T, clear: { lo: T + h + GAP, hi: bottom(vp) } };
  const trim = (c: { lo: number; hi: number }): Box | null => {
    const t = Math.max(spot.top, c.lo);
    const b = Math.min(bottom(spot), c.hi);
    return b - t >= need && b > t ? { left: spot.left, top: t, width: spot.width, height: b - t } : null;
  };
  const a = trim(atBottom.clear);
  const b = trim(atTop.clear);
  // Keep the larger visible part of the target.
  if (a && (!b || a.height >= b.height)) return round({ left: hLeft, top: atBottom.top, spot: a, side: "dock-bottom" });
  if (b) return round({ left: hLeft, top: atTop.top, spot: b, side: "dock-top" });
  return centred;
}
