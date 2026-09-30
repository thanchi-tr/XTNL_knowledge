import { SkeletonCard } from "@/components/ui/Tabs";

/** Static cards at the style guide's geometry; no shimmer. */
export default function Loading() {
  return (
    <div className="page" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 12 }}>
        <SkeletonCard lines={2} height={120} />
        <SkeletonCard lines={6} height={320} />
        <SkeletonCard lines={6} height={320} />
      </div>
    </div>
  );
}
