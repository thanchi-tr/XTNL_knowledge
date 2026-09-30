import { SkeletonCard } from "@/components/ui/Tabs";

/** The weekly review's skeleton: its two cards at their final geometry, static. */
export default function WeekLoading() {
  return (
    <div className="page narrow" aria-busy="true">
      <p className="sr-only" role="status">
        Loading the weekly review
      </p>
      <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        <SkeletonCard lines={4} height={240} />
        <SkeletonCard lines={5} height={280} />
      </div>
    </div>
  );
}
