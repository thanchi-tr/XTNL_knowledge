import { SkeletonCard } from "@/components/ui/Tabs";

/** Static cards at the list's geometry (the heading row, the search box, three visits); no shimmer. */
export default function Loading() {
  return (
    <div className="page narrow" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
        <SkeletonCard lines={1} height={96} />
        <SkeletonCard lines={2} height={88} />
        <SkeletonCard lines={2} height={88} />
        <SkeletonCard lines={2} height={88} />
      </div>
    </div>
  );
}
