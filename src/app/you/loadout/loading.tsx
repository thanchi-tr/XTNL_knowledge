import { Skeleton, SkeletonCard } from "@/components/ui/Tabs";

/** The loadout's geometry: ten square slots (the real .lo-slot box), then the effects list; no shimmer. */
export default function Loading() {
  return (
    <div className="you-grid" aria-busy="true">
      <span className="sr-only">Loading your loadout</span>
      <div className="skel-card">
        <Skeleton w="30%" h={16} />
        <div className="lo-slots">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} w="100%" h="auto" r={16} className="lo-slot-skel" />
          ))}
        </div>
        <Skeleton w="80%" h={14} />
      </div>
      <SkeletonCard lines={4} height={220} />
    </div>
  );
}
