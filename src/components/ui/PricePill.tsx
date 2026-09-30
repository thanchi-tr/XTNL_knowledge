/**
 * FROZEN CONTRACT — PricePill (L0-foundation).
 *
 *   <PricePill value={8.3} paid={false} kind="xp" onClick={openReceipt}
 *              expanded={open} controls="receipt-id" subject="Morning meds"/>
 *
 *   A 30 px pill inside a 44 hit area. Open: "≈ 8.3" + spark. Paid: "+8.3" on
 *   the currency wash, and it pays exactly that (the receipt equals the price).
 *   Tap opens the Receipt. Pass `ref` to use it as the origin of a T0 flight.
 */
import type { ComponentProps } from "react";
import type { CurrencyKind } from "@/lib/celebration-types";
import { cx } from "./cx";
import { approx, formatAmount, formatNumber } from "./format";
import { CurrencyGlyph } from "./Icon";

const WORD: Record<CurrencyKind, string> = { xp: "life XP", pts: "review points", mp: "mastery points" };

interface PricePillProps extends Omit<ComponentProps<"button">, "children"> {
  value: number;
  paid?: boolean;
  kind?: CurrencyKind;
  /** aria-expanded: whether its receipt is open. */
  expanded?: boolean;
  /** aria-controls: the receipt's id, while open. */
  controls?: string;
  /** What it prices, for the accessible name. */
  subject?: string;
  dp?: number;
}

export function PricePill({ value, paid, kind = "xp", expanded, controls, subject, dp = 1, className, type = "button", ...rest }: PricePillProps) {
  const figure = paid ? formatAmount(value, { dp }) : approx(value, dp);
  const name = paid
    ? `Paid ${formatNumber(value, dp)} ${WORD[kind]} exactly${subject ? ` for ${subject}` : ""}. Open the receipt`
    : `Pays about ${formatNumber(value, dp)} ${WORD[kind]}${subject ? ` for ${subject}` : ""}. Open the receipt`;
  return (
    <button
      {...rest}
      type={type}
      className={cx("price", className)}
      aria-label={name}
      aria-expanded={expanded}
      aria-controls={expanded ? controls : undefined}
    >
      <span className={cx("pill", paid && "paid", paid && kind === "pts" && "pts")}>
        <span className="num">{figure}</span>
        <CurrencyGlyph kind={kind} />
      </span>
    </button>
  );
}
