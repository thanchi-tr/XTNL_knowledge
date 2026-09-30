import { Skeleton, SkeletonCard } from "@/components/ui/Tabs";

/** Static blocks at the Library's geometry (search, chips, tiles, a section); no shimmer. */
export default function Loading() {
  return (
    <div className="page" aria-busy="true">
      <span className="sr-only">Loading the library</span>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 0 14px" }}>
        <Skeleton w={124} h={44} r={12} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Skeleton h={48} r={14} />
        <Skeleton w={104} h={48} r={12} />
      </div>
      <div style={{ display: "flex", gap: 6, margin: "12px 0 14px" }}>
        {[52, 64, 104, 104].map((w, i) => (
          <Skeleton key={i} w={w} h={40} r={8} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} lines={1} height={96} />
        ))}
      </div>
      <div style={{ marginTop: 18 }}>
        <Skeleton w={120} h={12} />
        <div style={{ marginTop: 10 }}>
          <SkeletonCard lines={4} height={260} />
        </div>
      </div>
    </div>
  );
}
