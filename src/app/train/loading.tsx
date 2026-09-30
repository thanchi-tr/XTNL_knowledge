import { SkeletonCard } from "@/components/ui/Tabs";

/** Static cards at the placeholder's geometry; no shimmer. */
export default function Loading() {
  return (
    <div className="page narrow" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 12 }}>
        <SkeletonCard lines={3} height={220} />
        <SkeletonCard lines={4} height={240} />
      </div>
    </div>
  );
}
