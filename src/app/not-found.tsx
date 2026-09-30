import { Button } from "@/components/ui/Button";

/**
 * The 404. Reached most often by a stale link to an idea or field that has
 * since been merged or archived (this app deduplicates its own taxonomy), or
 * by a route whose lane has not landed yet during the redesign. It offers the
 * places the content could have moved to rather than only an apology.
 */
export default function NotFound() {
  return (
    <div className="page narrow" style={{ paddingTop: 32 }}>
      <div className="card pad-l">
        <p className="t-eyebrow">404</p>
        <h2 className="t-display-m" style={{ marginTop: 6 }}>
          Nothing lives here
        </h2>
        <p className="t-meta" style={{ marginTop: 8 }}>
          This page doesn&apos;t exist. If you followed a link to an idea, it may have been merged into a near-duplicate or
          archived since.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          <Button variant="primary" href="/library">
            Search the library
          </Button>
          <Button variant="secondary" href="/today">
            Back to Today
          </Button>
        </div>
      </div>
    </div>
  );
}
