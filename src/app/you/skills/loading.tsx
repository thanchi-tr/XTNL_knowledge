import { Skeleton } from "@/components/ui/Tabs";

/** The Skills page's geometry: a header and rows of sigil + name, meter and two lines; no shimmer. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading your skills</span>
      <Skeleton w="30%" h={14} />
      <div className="skel-card" style={{ marginTop: 12, gap: 18 }}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Skeleton w={22} h={22} r={6} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <Skeleton w="45%" h={16} />
              <Skeleton w="100%" h={8} r={4} />
              <Skeleton w="65%" h={12} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
