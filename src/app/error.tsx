"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

/**
 * The route error boundary. Every page here reads a remote database, so a
 * dropped connection is routine and recoverable, not exotic.
 *
 * `unstable_retry` rather than `reset`: these pages fail because a fetch
 * failed, so re-rendering the same failed payload (what `reset` does) would
 * fail again. Retry re-runs the server render.
 */
export default function RouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="page narrow" style={{ paddingTop: 32 }}>
      <div className="card pad-l" role="alert">
        <p className="t-eyebrow">Something failed</p>
        <h2 className="t-display-m" style={{ marginTop: 6 }}>
          This screen didn&apos;t load
        </h2>
        <p className="t-meta" style={{ marginTop: 8 }}>
          Fetching this page failed. Your data is untouched: nothing here writes on load.
        </p>
        {/* The digest makes a report actionable; the raw message can carry query internals. */}
        {error.digest && (
          <p className="t-mono ink-2" style={{ marginTop: 10 }}>
            Reference {error.digest}
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          <Button variant="primary" onClick={() => unstable_retry()}>
            Try again
          </Button>
          <Button variant="secondary" href="/today">
            Back to Today
          </Button>
        </div>
      </div>
    </div>
  );
}
