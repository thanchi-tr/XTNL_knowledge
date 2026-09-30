import { Skeleton, SkeletonCard } from "@/components/ui/Tabs";

/** The loadout's geometry: ten slots, then the effects list; no shimmer. */
export default function Loading() {
  return (
    <div className="you-grid" aria-busy="true">
      <span className="sr-only">Loading your loadout</span>
      <div className="skel-card">
        <Skeleton w="30%" h={16} />
        <div className="slots">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} w="100%" h={56} r={16} />
          ))}
        </div>
        <Skeleton w="80%" h={14} />
      </div>
      <SkeletonCard lines={4} height={220} />
    </div>
  );
}
