"use client";

/**
 * The two live parts of You › Stats:
 *
 *   <TitleRing/>      "Distance to the next title": a ring (the kit's .pring
 *                     markup) that draws from the value seen on the last
 *                     visit, with the change stated in words. It never drops
 *                     on success: it is the continuous character level
 *                     through the current title band.
 *   <DividendLine/>   the capital dividend as a line item, with Claim
 *                     (no loudest-panel treatment until it has a real sink).
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { claimCapital } from "@/app/actions/capital";
import { play } from "@/lib/motion";
import { useLastSeen } from "@/components/ui/useLastSeen";
import { Button } from "@/components/ui/Button";

export function TitleRing({ fraction, next, nextAt, current }: { fraction: number; next: string | null; nextAt: number | null; current: string }) {
  const pct = Math.floor(Math.max(0, Math.min(1, fraction)) * 100);
  const seen = useLastSeen("you:title-distance", pct);
  const valRef = useRef<SVGCircleElement | null>(null);
  useEffect(() => {
    if (seen == null || seen === pct) return;
    void play(valRef.current, [{ strokeDashoffset: String(100 - seen) }, { strokeDashoffset: String(100 - pct) }], { duration: 700, fill: "backwards" });
  }, [seen, pct]);
  const change = seen == null ? null : pct - seen;
  return (
    <section className="card pad" style={{ display: "flex", gap: 14, alignItems: "center" }}>
      <div className="pring" style={{ ["--sz" as string]: "72px", ["--sw" as string]: 6, ["--p" as string]: pct }} role="img" aria-label={next ? `${pct}% of the way to ${next}` : "At the top of the title ladder"}>
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle className="trk" cx="18" cy="18" r="15.9" pathLength={100} />
          <circle ref={valRef} className="val" cx="18" cy="18" r="15.9" pathLength={100} />
        </svg>
        <div className="ctr" aria-hidden="true">
          <b className="t-numeral-s num">{pct}%</b>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <b>{next && nextAt != null ? `${next} at ${nextAt}` : `${current}: the ladder's top`}</b>
        <div className="t-meta">
          {change == null
            ? "Measured through your current title band. It never drops on success."
            : change > 0
              ? `+${change}% since your last visit. It never drops on success.`
              : "No change since your last visit."}
        </div>
      </div>
    </section>
  );
}

const oneDp = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

export function DividendLine({ amount, perHour, capped, balance }: { amount: number; perHour: number; capped: boolean; balance: number }) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<{ claimed: number; balance: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const claimable = amount >= 0.01 && state === null;

  function claim() {
    setError(null);
    startTransition(async () => {
      const res = await claimCapital();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setState({ claimed: res.amount, balance: res.balance });
    });
  }

  return (
    <section className="card pad" aria-label="Capital dividend">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <b>Capital dividend</b>
          <div className="t-meta">
            {state
              ? `Claimed ${oneDp(state.claimed)} · ${oneDp(state.balance)} banked. It accrues again from now.`
              : `${oneDp(amount)} waiting · ${oneDp(perHour)} an hour from your loadout · ${oneDp(balance)} banked${capped ? " · at the 48 h ceiling, so it has stopped growing" : ""}`}
          </div>
        </div>
        {claimable && (
          <Button variant="secondary" onClick={claim} disabled={isPending}>
            {isPending ? "Claiming…" : "Claim"}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="t-meta" style={{ color: "var(--owed)", marginTop: 6 }}>
          {error}
        </p>
      )}
    </section>
  );
}
