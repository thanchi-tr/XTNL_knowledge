/**
 * The Places sub-routes' loading blocks, each at its own page's geometry at 344 so nothing jumps when the page lands
 * (the list keeps src/app/places/loading.tsx): the form (Check in and Edit: the heading, then Where, When, Ratings,
 * Photos, Summary and the actions) and a visit (its heading, a 4:3 photo, the ratings, the summary, Edit and Delete).
 * Static blocks, no shimmer; aria-busy with one sr-only line. No hooks, no state, nothing read.
 */
import { Skeleton, SkeletonCard } from "@/components/ui/Tabs";

const COLUMN = { display: "flex", flexDirection: "column", gap: 16, paddingTop: 12 } as const;

export function FormSkeleton({ label }: { label: string }) {
  return (
    <div className="page narrow" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div style={COLUMN}>
        <Skeleton w={160} h={28} r={8} />
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <SkeletonCard lines={4} height={264} />
          <SkeletonCard lines={1} height={104} />
          <SkeletonCard lines={8} height={480} />
          <SkeletonCard lines={1} height={96} />
          <SkeletonCard lines={3} height={192} />
          <div style={{ display: "flex", gap: 8 }}>
            <Skeleton h={48} r={12} />
            <Skeleton h={48} r={12} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function VisitSkeleton() {
  return (
    <div className="page narrow" aria-busy="true">
      <span className="sr-only">Loading the visit</span>
      <div style={COLUMN}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton w="60%" h={28} r={8} />
          <Skeleton w="50%" h={14} />
        </div>
        <span aria-hidden="true" className="skel" style={{ display: "block", width: "100%", aspectRatio: "4 / 3", borderRadius: 16 }} />
        <SkeletonCard lines={5} height={270} />
        <SkeletonCard lines={2} height={90} />
        <div style={{ display: "flex", gap: 8 }}>
          <Skeleton w={80} h={44} r={12} />
          <Skeleton w={96} h={44} r={12} />
        </div>
      </div>
    </div>
  );
}
