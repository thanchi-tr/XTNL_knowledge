/**
 * The Receipt's diverging factor bars, as pure math (the checks import it).
 *
 * A factor is a multiplier. Its bar grows from the ×1.00 centre line on a
 * log scale, up (right, ink-0) when it raised the price and down (left,
 * ink-2) when it lowered it. ×1.00 draws nothing. `range` is the multiplier
 * that fills one half of the bar (×2.00 → full right, ×0.50 → full left).
 */
export interface BarGeometry {
  dir: "up" | "down" | "none";
  /** Percent from the left edge. */
  left: number;
  /** Percent of the whole bar. */
  width: number;
}

const EPS = 0.005;

export function divergingBar(mult: number, range = 2): BarGeometry {
  if (!Number.isFinite(mult) || mult <= 0 || Math.abs(mult - 1) < EPS) return { dir: "none", left: 50, width: 0 };
  const span = Math.log(Math.max(1.0001, range));
  const half = Math.min(50, (Math.abs(Math.log(mult)) / span) * 50);
  const width = Math.max(1.5, Number(half.toFixed(2)));
  return mult > 1 ? { dir: "up", left: 50, width } : { dir: "down", left: Number((50 - width).toFixed(2)), width };
}

/** A factor moved the price when it is not ×1.00 (to two decimals). */
export function factorMoved(mult: number): boolean {
  return Math.abs(Number(mult.toFixed(2)) - 1) >= EPS;
}

/** base × Π factors, to one decimal: the receipt must equal the price. */
export function receiptTotal(base: number, mults: number[]): number {
  const raw = mults.reduce((acc, m) => acc * m, base);
  return Number(raw.toFixed(1));
}
