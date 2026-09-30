import { SkeletonCard } from "@/components/ui/Tabs";

/**
 * The fallback every route inherits until it ships its own: static cards at
 * a board's geometry, no shimmer and no fade (nothing moves on arrival). The
 * shell stays put around it; only the page area waits.
 */
export default function Loading() {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
        <SkeletonCard lines={3} height={168} />
        <SkeletonCard lines={2} height={132} />
        <SkeletonCard lines={4} height={220} />
      </div>
    </div>
  );
}
