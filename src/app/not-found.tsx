import Link from "next/link";

/**
 * The 404.
 *
 * Reached most often by a stale link to an Idea or Field that has since been
 * deleted or merged — which is a normal outcome in an app whose whole job is
 * deduplicating and reorganising its own taxonomy, not a dead end. So it
 * offers the two places that content could have moved to rather than only an
 * apology.
 */
export default function NotFound() {
  return (
    <main className="site-container flex flex-1 items-center justify-center py-16">
      <div className="card fade-up w-full max-w-md p-6 text-center">
        <p className="mono" style={{ fontSize: 30, fontWeight: 700, color: "var(--ink-3)", lineHeight: 1 }}>
          404
        </p>

        <h1 className="mt-2.5" style={{ fontSize: 17, fontWeight: 700, color: "var(--ink-0)" }}>
          Nothing lives here
        </h1>
        <p className="mt-1.5" style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
          This page doesn&apos;t exist. If you followed a link to an Idea, it may have been merged into a
          near-duplicate or archived since.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link href="/library" className="btn-primary no-underline">
            Search the library
          </Link>
          <Link href="/" className="btn-secondary no-underline">
            Back to overview
          </Link>
        </div>
      </div>
    </main>
  );
}
