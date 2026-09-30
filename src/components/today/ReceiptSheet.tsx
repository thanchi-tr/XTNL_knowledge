"use client";

import type { Receipt as LifeReceipt, ReceiptFactor as LifeFactor } from "@/lib/life-types";
import { TRACK_LABEL, kneeNote, shownFactors } from "@/lib/life-grade";
import { Receipt, type ReceiptFactor } from "@/components/ui/Receipt";
import { Sheet } from "@/components/ui/Sheet";
import { formatNumber } from "@/components/ui/format";

/** The kit's factor names for the life formula's keys (B is the base, shown in the formula). */
const FACTOR_NAME: Record<Exclude<LifeFactor["key"], "B">, string> = {
  E: "Effort",
  T: "Timing",
  C: "Streak",
  D: "Repeat",
  V: "Volume",
  K: "Mode",
};

/**
 * A life receipt in the kit's words: every factor but the band as a
 * diverging bar around ×1.00 (the band is the base, stated in the formula),
 * the formula to the raw price, and the daily knee in one sentence. The
 * receipt and the price are the same object, so what it says is what a tick
 * pays (or paid).
 */
export function receiptView(r: LifeReceipt): {
  factors: ReceiptFactor[];
  formula: string;
  note: string;
  zero: string | null;
} {
  const shown = shownFactors(r);
  const base = shown.find((f) => f.key === "B");
  const factors: ReceiptFactor[] = shown
    .filter((f): f is LifeFactor & { key: Exclude<LifeFactor["key"], "B"> } => f.key !== "B")
    .map((f) => ({ key: f.key, label: FACTOR_NAME[f.key], detail: f.note ? `${f.label} · ${f.note}` : f.label, mult: f.value }));
  const formula = base ? `${base.label} ${base.value} base × factors = ${formatNumber(r.raw, 1)}` : `= ${formatNumber(r.raw, 1)}`;
  const k = r.factors.find((f) => f.key === "K");
  const zero = k && k.value === 0 ? (k.label === "paid by reviews" ? "Paid by reviews, not twice." : "Play: logged and kept in the streak, unpaid.") : null;
  const eased = r.raw > 0 && r.xp < r.raw - 0.05;
  const knee = kneeNote(r);
  const note = [
    zero,
    eased ? `Priced ${formatNumber(r.raw, 1)}, pays ${formatNumber(r.xp, 1)}: ${knee}.` : `Daily knee: ${knee}.`,
    r.selfRated ? "Self-rated band." : null,
  ]
    .filter(Boolean)
    .join(" ");
  return { factors, formula, note, zero };
}

export function ReceiptSheet({
  open,
  onClose,
  id,
  title,
  receipt,
  paid,
}: {
  open: boolean;
  onClose: () => void;
  /** The price pill's aria-controls points here. */
  id: string;
  title: string;
  receipt: LifeReceipt | null;
  /** A stored receipt (paid) rather than the price now. */
  paid: boolean;
}) {
  const view = receipt ? receiptView(receipt) : null;
  return (
    <Sheet open={open && !!receipt} onClose={onClose} id={id} title={title} description={paid ? "Receipt · what the tick paid" : "Price now · what a tick pays"}>
      {receipt && view && (
        <Receipt
          amount={receipt.xp}
          kind="xp"
          source={TRACK_LABEL[receipt.track] ?? receipt.track}
          factors={view.factors}
          formula={view.formula}
          note={view.note}
          version={receipt.v}
          howHref="/today/rules"
        />
      )}
    </Sheet>
  );
}
