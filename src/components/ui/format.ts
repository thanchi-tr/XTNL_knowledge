/**
 * FROZEN CONTRACT — how figures are written (pure; the checks import it).
 *
 *   formatNumber(1346.04, 1)        "1,346.0"   en-GB grouping, fixed decimals
 *   formatAmount(4.2)               "+4.2"      a sign only on credits
 *   formatAmount(-3.8)              "−3.8"      a true minus (U+2212) on debt
 *   formatAmount(0)                 "0.0"
 *   approx(8.34)                    "≈ 8.3"     an open price
 *   formatMultiplier(1.15)          "×1.15"
 *   formatPercent(0.864)            "86%"
 *
 * Two ledgers are never summed: there is deliberately no helper that adds
 * an xp figure to a pts figure.
 */
export const MINUS = "−";

export function formatNumber(value: number, dp = 1): string {
  const v = Object.is(value, -0) ? 0 : value;
  return v.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export interface AmountFormat {
  dp?: number;
  /** "auto": + on credits, − on debits (default). "none": never a sign (a balance). */
  sign?: "auto" | "none";
}

export function formatAmount(value: number, { dp = 1, sign = "auto" }: AmountFormat = {}): string {
  const rounded = Number(value.toFixed(dp));
  const body = formatNumber(Math.abs(rounded), dp);
  if (sign === "none") return rounded < 0 ? `${MINUS}${body}` : body;
  if (rounded > 0) return `+${body}`;
  if (rounded < 0) return `${MINUS}${body}`;
  return body;
}

export function approx(value: number, dp = 1): string {
  return `≈ ${formatNumber(value, dp)}`;
}

export function formatMultiplier(m: number, dp = 2): string {
  return `×${m.toFixed(dp)}`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}
