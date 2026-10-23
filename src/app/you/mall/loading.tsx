import { Skeleton } from "@/components/ui/Tabs";

/** The Mall page's geometry: the wallet card, then rows of a name, a price and a line; no shimmer. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading the Mall</span>
      <div className="skel-card" style={{ gap: 10 }}>
        <Skeleton w="20%" h={12} />
        <Skeleton w="35%" h={22} />
        <Skeleton w="70%" h={12} />
      </div>
      <Skeleton w="30%" h={14} />
      <div className="skel-card" style={{ marginTop: 12, gap: 18 }}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <Skeleton w="45%" h={16} />
              <Skeleton w={56} h={16} />
            </div>
            <Skeleton w="60%" h={12} />
          </div>
        ))}
      </div>
    </div>
  );
}
