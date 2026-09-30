import { Skeleton } from "@/components/ui/Tabs";

/** The shelf's geometry: a month header and rows of art + two lines; no shimmer. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading your moments</span>
      <Skeleton w="40%" h={14} />
      <div className="skel-card" style={{ marginTop: 12, gap: 18 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Skeleton w={44} h={44} r={22} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <Skeleton w="55%" h={16} />
              <Skeleton w="35%" h={12} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
