import { SkeletonCard } from "@/components/ui/Tabs";

/** Stats geometry: the tile row, then two columns of cards; no shimmer. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading your stats</span>
      <div className="tiles" style={{ marginBottom: 16 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} lines={1} height={84} />
        ))}
      </div>
      <div className="you-grid">
        <div className="you-stack">
          <SkeletonCard lines={5} height={260} />
          <SkeletonCard lines={4} height={200} />
        </div>
        <div className="you-stack">
          <SkeletonCard lines={2} height={110} />
          <SkeletonCard lines={2} height={90} />
          <SkeletonCard lines={4} height={200} />
        </div>
      </div>
    </div>
  );
}
