import { Skeleton, SkeletonCard } from "@/components/ui/Tabs";

/** Static blocks at Fields & Domains' geometry (intro, new-field row, field cards); no shimmer. */
export default function Loading() {
  return (
    <div className="page narrow" aria-busy="true">
      <span className="sr-only">Loading fields and domains</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
        <Skeleton w="90%" h={13} />
        <div style={{ display: "flex", gap: 8 }}>
          <Skeleton h={48} r={12} />
          <Skeleton w={112} h={44} r={12} />
        </div>
        <SkeletonCard lines={4} height={220} />
        <SkeletonCard lines={3} height={180} />
      </div>
    </div>
  );
}
