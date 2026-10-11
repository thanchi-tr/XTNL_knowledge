import { Skeleton, SkeletonCard } from "@/components/ui/Tabs";

/**
 * Static blocks at the living roadmap's geometry at 344 (the next action
 * first: the ring, the title and its button; then the Aim header with its
 * rank and Proficiency, Now with its folds, Toward the aim): no shimmer,
 * nothing that moves. From 760 px the hero spans the page and the rest sit in
 * two columns.
 */
export default function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-busy="true">
      <span className="sr-only">Loading your roadmap</span>
      <div className="skel-card" style={{ minHeight: 190 }}>
        <Skeleton w="30%" h={12} />
        <Skeleton w="70%" h={22} />
        <Skeleton h={48} r={12} />
        <Skeleton w="50%" h={44} r={10} />
      </div>
      <div className="you-grid">
        <div className="you-stack">
          <div className="skel-card" style={{ minHeight: 300 }}>
            <Skeleton w="20%" h={12} />
            <Skeleton w="85%" h={23} />
            <Skeleton w="55%" h={24} />
            <Skeleton h={8} r={4} />
            <Skeleton w="70%" h={14} />
          </div>
          <SkeletonCard lines={5} height={300} />
        </div>
        <div className="you-stack">
          <SkeletonCard lines={4} height={220} />
          <SkeletonCard lines={1} height={52} />
        </div>
      </div>
    </div>
  );
}
