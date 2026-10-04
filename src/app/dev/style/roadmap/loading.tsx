import { SkeletonCard } from "@/components/ui/Tabs";

/** Static cards at the roadmap fixtures' geometry; no shimmer. */
export default function Loading() {
  return (
    <div className="page" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 12 }}>
        <SkeletonCard lines={1} height={52} />
        <SkeletonCard lines={6} height={330} />
        <SkeletonCard lines={8} height={420} />
      </div>
    </div>
  );
}
