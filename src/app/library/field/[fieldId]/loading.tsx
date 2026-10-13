import { Skeleton, SkeletonCard } from "@/components/ui/Tabs";

/** Static blocks at the Field page's geometry (back, the summary card, chips, a Domain); no shimmer. */
export default function Loading() {
  return (
    <div className="page" aria-busy="true">
      <span className="sr-only">Loading the field</span>
      <div style={{ padding: "10px 0 14px" }}>
        <Skeleton w={104} h={44} r={12} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
        <SkeletonCard lines={6} height={360} />
        <div style={{ display: "flex", gap: 6 }}>
          {[52, 64, 84, 104].map((w, i) => (
            <Skeleton key={i} w={w} h={40} r={8} />
          ))}
        </div>
        <div>
          <Skeleton w={120} h={12} />
          <div style={{ marginTop: 10 }}>
            <SkeletonCard lines={4} height={260} />
          </div>
        </div>
      </div>
    </div>
  );
}
