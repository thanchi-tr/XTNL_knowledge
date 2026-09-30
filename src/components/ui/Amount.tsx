/**
 * FROZEN CONTRACT — Amount (L0-foundation).
 *
 *   <Amount kind="xp|pts|mp" value={4.2} sign="auto|none" dp={1} label?/>
 *     Glyph in the currency hue, figure in ink, tabular numerals. "+4.2" on credits,
 *     "−3.8" on debt, no sign on a balance (sign="none"). Two ledgers are never summed.
 */
import type { ReactNode } from "react";
import type { CurrencyKind } from "@/lib/celebration-types";
import { cx } from "./cx";
import { formatAmount } from "./format";
import { CurrencyGlyph } from "./Icon";

export function Amount({
  kind,
  value,
  sign = "auto",
  dp = 1,
  label,
  className,
}: {
  kind: CurrencyKind;
  value: number;
  sign?: "auto" | "none";
  dp?: number;
  /** Words after the figure ("life XP", "owed"). */
  label?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("cur", className)}>
      <CurrencyGlyph kind={kind} />
      <span className="num">{formatAmount(value, { dp, sign })}</span>
      {label && <span>{label}</span>}
    </span>
  );
}
