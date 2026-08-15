"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * The route error boundary.
 *
 * Without this file, any thrown error inside a page rendered Next's own
 * error screen — an unstyled stack trace in production-grey, which is the
 * single most jarring thing this app could show someone. Every route in here
 * is server-rendered against Supabase, so a dropped connection or a cold
 * pool is a routine, recoverable event rather than an exotic one.
 *
 * `unstable_retry` rather than `reset`: these pages fail because a *fetch*
 * failed, so re-rendering the same already-failed payload (what `reset`
 * does) would simply fail again. Retry re-runs the server render, which is
 * the thing that can actually succeed on a second attempt.
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
    <main className="site-container flex flex-1 items-center justify-center py-16">
      <div className="card fade-up w-full max-w-md p-6 text-center">
        <div
          aria-hidden
          className="mx-auto mb-3 grid place-items-center"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "var(--red-10)",
            border: "1px solid rgba(240,58,87,0.24)",
            color: "var(--red)",
            fontSize: 20,
          }}
        >
          !
        </div>

        <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--ink-0)" }}>This screen didn&apos;t load</h1>
        <p className="mt-1.5" style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
          Something failed while fetching this page. Your data is untouched — nothing here writes on load.
        </p>

        {/* The digest is what makes a production report actionable; the raw
            message is withheld because it can carry query internals. */}
        {error.digest && (
          <p className="mono mt-3" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
            Reference {error.digest}
          </p>
        )}

        <div className="mt-4 flex items-center justify-center gap-2">
          <button type="button" className="btn-primary" onClick={() => unstable_retry()}>
            Try again
          </button>
          <Link href="/" className="btn-secondary no-underline">
            Back to overview
          </Link>
        </div>
      </div>
    </main>
  );
}
