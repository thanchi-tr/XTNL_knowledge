"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { Receipt, ReceiptFactor } from "@/lib/life-types";
import { TRACK_LABEL, kneeNote, shownFactors } from "@/lib/life-grade";
import { pushEscapeLayer } from "@/components/capture/layers";

/**
 * The receipt behind a row's '≈ N XP': every factor that made the price,
 * the raw total, and where the payment sat on the day's knee.
 *
 * The same object whether it is a projection (what a tick would pay now)
 * or a paid row's stored receipt — the board prices both with one function
 * — so the only difference drawn is the wording at the bottom. This is the
 * one place the knee is shown ('46 of 100 full-rate used today'): there is
 * deliberately no daily XP bar anywhere, because a meter to fill invites
 * grinding the day rather than doing it.
 *
 * Rendered inline under its row, not floating, so on a phone it never
 * covers the rows around it or collides with the notification bubble. The
 * board owns whether it is open; Escape closes it when `onClose` is given —
 * as one layer of the app's Escape stack, so an Escape meant for a sheet
 * opened above it closes only that sheet.
 */

interface Props {
  receipt: Receipt;
  /** A stored receipt (paid) rather than a projection. */
  paid?: boolean;
  /** The task's title, for the panel's accessible name. */
  title?: string;
  onClose?: () => void;
  id?: string;
}

function factorValue(f: ReceiptFactor): string {
  return f.key === "B" ? String(f.value) : `×${f.value.toFixed(2)}`;
}

/** What the payment line says when it is not a plain amount. */
function zeroReason(r: Receipt): string | null {
  const k = r.factors.find((f) => f.key === "K");
  if (!k || k.value !== 0) return null;
  return k.label === "paid by reviews" ? "Paid by reviews, not twice" : "Play: logged and kept in the streak, unpaid";
}

export function ReceiptPopover({ receipt, paid = false, title, onClose, id }: Props) {
  // The layer is registered once, when the panel opens; a new onClose from
  // a re-render must not re-push it above a sheet opened since.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const closable = !!onClose;
  useEffect(() => {
    if (!closable) return;
    return pushEscapeLayer(() => closeRef.current?.());
  }, [closable]);

  const factors = shownFactors(receipt);
  const zero = zeroReason(receipt);
  const eased = receipt.raw > 0 && receipt.xp < receipt.raw - 0.05;
  const track = TRACK_LABEL[receipt.track] ?? receipt.track;

  return (
    <div
      id={id}
      role="region"
      aria-label={title ? `Receipt for ${title}` : "Receipt"}
      className="mt-0 mb-2.5 rounded-[10px] px-3 pt-2.5 pb-3"
      style={{
        marginLeft: "clamp(6px, 6vw, 48px)",
        marginRight: 8,
        background: "var(--sub)",
        border: "1px solid var(--line)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="label-xs" style={{ fontSize: 9.5 }}>
          {paid ? "Receipt" : "Price now"}
          {receipt.selfRated && (
            <span className="chip chip-blue ml-2" style={{ fontSize: 9, padding: "1px 6px" }}>
              self-rated
            </span>
          )}
        </p>
        {onClose && (
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            style={{ fontSize: 11, padding: "0 12px", minHeight: 40 }}
          >
            Close
          </button>
        )}
      </div>

      <table className="mt-1.5 w-full" style={{ fontSize: 12, borderCollapse: "collapse" }}>
        <tbody>
          {factors.map((f) => (
            <tr key={f.key} style={{ borderTop: "1px solid var(--line)" }}>
              <td className="mono py-1 pr-2 align-top" style={{ width: 18, color: "var(--ink-3)", fontSize: 10.5 }}>
                {f.key}
              </td>
              <td className="py-1 pr-2 align-top" style={{ color: "var(--ink-1)" }}>
                {f.label}
                {f.note && (
                  <span className="block" style={{ fontSize: 10.5, color: "var(--ink-3)", lineHeight: 1.4 }}>
                    {f.note}
                  </span>
                )}
              </td>
              <td className="mono py-1 text-right align-top" style={{ color: "var(--ink-0)", whiteSpace: "nowrap" }}>
                {factorValue(f)}
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: "1px solid var(--line-hi)" }}>
            <td className="py-1" />
            <td className="py-1 pr-2" style={{ color: "var(--ink-2)" }}>
              Price
            </td>
            <td className="mono py-1 text-right" style={{ color: "var(--ink-0)", fontWeight: 600 }}>
              {receipt.raw.toFixed(1)}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-1.5" style={{ fontSize: 11.5, lineHeight: 1.5, color: eased ? "var(--blue)" : "var(--ink-2)" }}>
        {kneeNote(receipt)}
        {eased && <span style={{ color: "var(--ink-2)" }}> · {receipt.raw.toFixed(1)} priced, {receipt.xp.toFixed(1)} paid</span>}
      </p>

      <p className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1" style={{ fontSize: 12 }}>
        <span style={{ color: zero ? "var(--ink-2)" : paid ? "var(--green)" : "var(--ink-0)" }}>
          {zero ?? (
            <>
              {paid ? "Paid" : "A tick pays"}{" "}
              <span className="mono" style={{ fontWeight: 600 }}>
                {receipt.xp.toFixed(1)} XP
              </span>{" "}
              → {track}
            </>
          )}
        </span>
        <Link href="/today/rules" className="no-underline" style={{ fontSize: 10.5, color: "var(--blue)" }}>
          {receipt.v} · how this is priced →
        </Link>
      </p>
    </div>
  );
}
