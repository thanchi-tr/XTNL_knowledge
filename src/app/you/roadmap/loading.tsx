import { Skeleton, SkeletonCard } from "@/components/ui/Tabs";

/**
 * Static blocks at the living roadmap's geometry at 344 (the Aim header with
 * its rank and Proficiency, Now with its week quests, Toward the aim): no
 * shimmer, nothing that moves. From 760 px they sit in two columns.
 */
export default function Loading() {
  return (
    <div className="you-grid" aria-busy="true">
      <span className="sr-only">Loading your roadmap</span>
      <div className="you-stack">
        <div className="skel-card" style={{ minHeight: 330 }}>
          <Skeleton w="20%" h={12} />
          <Skeleton w="85%" h={23} />
          <Skeleton w="55%" h={24} />
          <Skeleton h={8} r={4} />
          <Skeleton w="70%" h={14} />
          <Skeleton w="60%" h={14} />
        </div>
        <SkeletonCard lines={8} height={420} />
      </div>
      <div className="you-stack">
        <SkeletonCard lines={4} height={220} />
        <SkeletonCard lines={1} height={52} />
      </div>
    </div>
  );
}
