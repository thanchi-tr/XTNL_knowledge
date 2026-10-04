import { SkeletonCard } from "@/components/ui/Tabs";

/** Static blocks at the intake form's geometry (one 640 px column): no shimmer. */
export default function Loading() {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }} aria-busy="true">
      <span className="sr-only">Loading the form</span>
      <SkeletonCard lines={6} height={420} />
      <SkeletonCard lines={6} height={460} />
      <SkeletonCard lines={4} height={300} />
    </div>
  );
}
