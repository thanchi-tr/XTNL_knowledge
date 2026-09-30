import { Skeleton } from "@/components/ui/Tabs";

/** Static blocks at the New idea form's geometry; no shimmer. */
export default function Loading() {
  return (
    <div className="page narrow" aria-busy="true">
      <span className="sr-only">Loading the form</span>
      <div style={{ padding: "8px 0 12px" }}>
        <Skeleton w="80%" h={13} />
      </div>
      <div className="skel-card" style={{ gap: 14 }} aria-hidden="true">
        <Skeleton w={72} h={13} />
        <Skeleton h={72} r={12} />
        <Skeleton w={60} h={13} />
        <Skeleton h={96} r={12} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Skeleton h={48} r={12} />
          <Skeleton h={48} r={12} />
        </div>
        <Skeleton h={44} r={10} />
      </div>
      <div style={{ display: "flex", gap: 8, padding: "12px 0" }}>
        <Skeleton w={132} h={48} r={12} />
        <Skeleton h={48} r={12} />
      </div>
    </div>
  );
}
