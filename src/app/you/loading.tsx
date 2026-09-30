import { Skeleton, SkeletonCard } from "@/components/ui/Tabs";

/** Static blocks at the sheet's geometry (hero, tracks | radar, mastery); no shimmer. */
export default function Loading() {
  return (
    <div className="you-grid" aria-busy="true">
      <span className="sr-only">Loading your character sheet</span>
      <div className="you-stack">
        <div className="skel-card" style={{ minHeight: 300 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <Skeleton w={96} h={100} r={20} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <Skeleton w="60%" h={30} />
              <Skeleton w="45%" h={16} />
            </div>
          </div>
          <Skeleton h={8} r={4} />
          <Skeleton w="70%" h={16} />
          <Skeleton h={44} />
        </div>
        <SkeletonCard lines={2} height={110} />
      </div>
      <div className="you-stack">
        <SkeletonCard lines={6} height={380} />
        <SkeletonCard lines={2} height={140} />
      </div>
    </div>
  );
}
