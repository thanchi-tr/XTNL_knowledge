import { Skeleton, SkeletonCard } from "@/components/ui/Tabs";

/** Static blocks at Settings' geometry (three section cards); no shimmer. Inside layout.tsx (the page and the You tabs). */
export default function Loading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading settings</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
        <Skeleton w={96} h={12} />
        <SkeletonCard lines={5} height={330} />
        <Skeleton w={64} h={12} />
        <SkeletonCard lines={4} height={250} />
        <Skeleton w={120} h={12} />
        <SkeletonCard lines={5} height={310} />
      </div>
    </div>
  );
}
