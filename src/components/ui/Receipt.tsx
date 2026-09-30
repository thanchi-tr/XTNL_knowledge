/**
 * FROZEN CONTRACT — Receipt (L0-foundation). Put it inside a <Sheet>.
 *
 *   <Receipt amount={22.0} kind="xp" source="Craft"
 *            factors={[{ key: "band", label: "Band", detail: "45 min · base 20", mult: 1 }, …]}
 *            formula="20 base × factors = 22.0" note="…daily knee sentence…"
 *            version="xp v3" howHref="/today/rules"/>
 *
 *   Amount (display 30) plus "pays exactly this · Craft". Factor rows with
 *   DIVERGING mini-bars around ×1.00 (log scale; up in ink-0, down in ink-2);
 *   factors that moved the price are ink-0, ×1.00 factors are ink-2. Then the
 *   formula in mono, the note, the formula version and a "How XP works" link.
 *   The review receipt is the same component with base × combo × focus.
 */
import Link from "next/link";
import type { CurrencyKind } from "@/lib/celebration-types";
import { cx } from "./cx";
import { formatMultiplier, formatNumber } from "./format";
import { CurrencyGlyph } from "./Icon";
import { divergingBar, factorMoved } from "./receipt-math";

export interface ReceiptFactor {
  key: string;
  /** "Band", "Effort", "Timing", "Streak", "Repeat", "Volume", "Mode", "Combo", "Focus". */
  label: string;
  /** "45 min · base 20" */
  detail?: string;
  mult: number;
}

interface ReceiptProps {
  amount: number;
  kind?: CurrencyKind;
  /** The track or ledger it pays into ("Craft", "Statistics"). */
  source?: string;
  factors: ReceiptFactor[];
  /** "20 base × factors = 22.0" */
  formula: string;
  note?: string;
  version?: string;
  howHref?: string;
  howLabel?: string;
  dp?: number;
  className?: string;
}

export function Receipt({ amount, kind = "xp", source, factors, formula, note, version, howHref, howLabel = "How XP works", dp = 1, className }: ReceiptProps) {
  return (
    <div className={cx("receipt", className)}>
      <div className="rc-amt">
        <CurrencyGlyph kind={kind} size={18} />
        <b className="num">{formatNumber(amount, dp)}</b>
        <span className="t-meta">pays exactly this{source ? ` · ${source}` : ""}</span>
      </div>
      <div role="table" aria-label="Factors">
        {factors.map((f) => {
          const bar = divergingBar(f.mult);
          const moved = factorMoved(f.mult);
          return (
            <div key={f.key} role="row" className={cx("rc-row", moved && "moved")}>
              <span role="rowheader" className="k">
                {f.label}
              </span>
              <span role="cell" className="d">
                {f.detail ?? ""}
              </span>
              <span role="cell" className="dbar" aria-hidden="true">
                {bar.dir !== "none" && <i className={bar.dir === "down" ? "down" : undefined} style={{ left: `${bar.left}%`, width: `${bar.width}%` }} />}
              </span>
              <span role="cell" className="x">
                {formatMultiplier(f.mult)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="rc-total">
        <span className="t-mono">{formula}</span>
      </div>
      {note && <p className="rc-note">{note}</p>}
      {(version || howHref) && (
        <p className="rc-note">
          {version && <span>Formula {version}</span>}
          {version && howHref && " · "}
          {howHref && (
            <Link className="link" href={howHref}>
              {howLabel}
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
