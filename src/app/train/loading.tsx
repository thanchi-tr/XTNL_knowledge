import { SkeletonCard } from "@/components/ui/Tabs";

/** Static cards at the page's geometry (the Body weight card, then this week's walks); no shimmer. */
export default function Loading() {
  return (
    <div className="page narrow" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 12 }}>
        <SkeletonCard lines={5} height={520} />
        <SkeletonCard lines={3} height={220} />
      </div>
    </div>
  );
}
