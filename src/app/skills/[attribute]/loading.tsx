import { Skeleton, SkeletonCard } from "@/components/ui/Tabs";

/** Static blocks at the Skills geometry (chips, the path header, the ladder); no shimmer. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading skills</span>
      <div style={{ display: "flex", gap: 6, overflow: "hidden", padding: "2px 2px 4px" }}>
        {[88, 96, 132, 104, 92].map((w, i) => (
          <Skeleton key={i} w={w} h={40} r={10} />
        ))}
      </div>
      <Skeleton h={96} r={16} className="skel-phead" />
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <SkeletonCard lines={3} height={180} />
        <SkeletonCard lines={3} height={240} />
      </div>
    </div>
  );
}
