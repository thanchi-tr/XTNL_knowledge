import { Skeleton, SkeletonCard } from "@/components/ui/Tabs";
import "@/components/workspace/review.css";

/**
 * The hub at its final geometry — quest card, loadout strip, encounters,
 * Recent — as static blocks: no shimmer, no fade (nothing moves on arrival).
 */
export default function Loading() {
  return (
    <div className="page cq-main" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="rv-hub">
        <div className="rv-col">
          <div className="card rv-hero" aria-hidden="true">
            <div className="rv-hero-top">
              <Skeleton w={64} h={64} r={32} />
              <div style={{ flex: 1, display: "grid", gap: 8 }}>
                <Skeleton w="55%" h={12} />
                <Skeleton w="35%" h={26} />
                <Skeleton w="80%" h={13} />
              </div>
            </div>
            <Skeleton h={48} r={12} />
            <div className="rv-chips">
              <Skeleton w={96} h={40} r={8} />
              <Skeleton w={112} h={40} r={8} />
              <Skeleton w={104} h={40} r={8} />
            </div>
          </div>
          <SkeletonCard lines={1} height={52} />
        </div>
        <div className="rv-col">
          <SkeletonCard lines={2} height={104} />
          <SkeletonCard lines={3} height={150} />
        </div>
      </div>
    </div>
  );
}
