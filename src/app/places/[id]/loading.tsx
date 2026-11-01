import { VisitSkeleton } from "@/components/places/Skeletons";

/** Static blocks at a visit's geometry (its heading, a 4:3 photo, the ratings, the summary, Edit and Delete); no shimmer. */
export default function Loading() {
  return <VisitSkeleton />;
}
