"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reattributeTaxonomy, type ReattributeSummary } from "@/app/actions/reattribute";

/**
 * Re-derives every Field and Domain composition from the current lexicon.
 *
 * Attribution is written once at creation, which keeps a Domain's identity
 * stable — but it also means the taxonomy keeps whatever the lexicon said on
 * the day each row was made. This is the catch-up. Non-destructive: it
 * rewrites attribute weights, never names, points, levels or ideas.
 *
 * Sits next to the danger zone but is deliberately not styled like it. The
 * two are adjacent in placement only; one is irreversible and the other can
 * be run as often as you like with no effect beyond the first time.
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
        setError("Could not recompute attribution.");
      }
    });
  }

  const changedFields = result?.fields.filter((f) => f.changed) ?? [];

  return (
    <section className="card mt-6 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="panel-title">Recompute attribution</h2>
          <p className="panel-sub">
            Re-reads every Field and Domain name with the current lexicon. Names, points and ideas are
            untouched.
          </p>
        </div>
        <button type="button" className="btn-secondary" disabled={isPending} onClick={run}>
          {isPending ? "Recomputing…" : "Recompute"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3" style={{ fontSize: 12, color: "var(--red)" }}>
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3">
          <p className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>
            {changedFields.length} field{changedFields.length === 1 ? "" : "s"} · {result.domainsUpdated}{" "}
            domain{result.domainsUpdated === 1 ? "" : "s"} updated · {result.domainsUnchanged} already current
          </p>
          {changedFields.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {changedFields.map((f) => (
                <li key={f.name} style={{ fontSize: 11.5 }}>
                  <span style={{ color: "var(--ink-0)", fontWeight: 600 }}>{f.name}</span>
                  <span className="mono block" style={{ color: "var(--ink-3)" }}>
                    {f.before}
                  </span>
                  <span className="mono block" style={{ color: "var(--green)" }}>
                    {f.after}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
