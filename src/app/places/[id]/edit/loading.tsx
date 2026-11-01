import { FormSkeleton } from "@/components/places/Skeletons";

/** Static blocks at the Edit form's geometry (the form again, so a hard load of Edit never shows the visit's blocks); no shimmer. */
export default function Loading() {
  return <FormSkeleton label="Loading the form" />;
}
