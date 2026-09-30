import { Skeleton, SkeletonCard } from "@/components/ui/Tabs";

/** Static blocks at the idea page's geometry (header, Q&A, level row, history); no shimmer. */
export default function Loading() {
  return (
    <div className="page narrow" aria-busy="true">
      <span className="sr-only">Loading the idea</span>
      <div style={{ padding: "10px 0 14px" }}>
        <Skeleton w={104} h={44} r={12} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
        <SkeletonCard lines={1} height={96} />
        <SkeletonCard lines={3} height={150} />
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Skeleton w={56} h={56} r={28} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton w="40%" h={16} />
            <Skeleton w="70%" h={12} />
          </div>
        </div>
        <Skeleton h={6} r={2} />
      </div>
    </div>
  );
}
