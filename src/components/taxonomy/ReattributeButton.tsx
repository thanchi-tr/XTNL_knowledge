"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reattributeTaxonomy, type ReattributeSummary } from "@/app/actions/reattribute";
import { Button } from "@/components/ui/Button";
import "@/components/settings/settings.css";

/**
 * Re-derives every Field and Domain composition from the current lexicon
 * (Settings › Data).
 *
 * Attribution is written once at creation, which keeps a Domain's identity
 * stable, but it also means the taxonomy keeps whatever the lexicon said on
 * the day each row was made. This is the catch-up. Non-destructive: it
 * rewrites attribute weights, never names, points, levels or ideas, and can
 * be run as often as you like. It sits beside the resets but is deliberately
 * not styled like them.
 */
export function ReattributeButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ReattributeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        setResult(await reattributeTaxonomy());
        router.refresh();
      } catch {
        setError("Couldn't recompute attribution. Try again.");
      }
    });
  }

  const changedFields = result?.fields.filter((f) => f.changed) ?? [];

  return (
    <section className="dz-sec" aria-labelledby="ra-h">
      <h3 id="ra-h">Recompute attribution</h3>
      <p className="t-meta">
        Re-reads every Field and Domain name with the current lexicon. Names, points, levels and ideas are untouched.
      </p>
      <div>
        <Button variant="secondary" disabled={isPending} onClick={run}>
          {isPending ? "Recomputing…" : "Recompute"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="t-meta" style={{ color: "var(--owed)" }}>
          {error}
        </p>
      )}

      {result && (
        <div role="status" className="dz-sec" style={{ gap: 8 }}>
          <p className="t-meta">
            {changedFields.length} field{changedFields.length === 1 ? "" : "s"} changed · {result.domainsUpdated} domain
            {result.domainsUpdated === 1 ? "" : "s"} updated · {result.domainsUnchanged} already current
          </p>
          {changedFields.length > 0 && (
            <ul className="dz-list">
              {changedFields.map((f) => (
                <li key={f.name} className="dz-diff">
                  <b className="ink-0">{f.name}</b>
                  <span className="t-mono ink-2">was {f.before}</span>
                  <span className="t-mono ink-0">now {f.after}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
