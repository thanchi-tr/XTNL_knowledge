import { FormSkeleton } from "@/components/places/Skeletons";

/** Static blocks at the check-in form's geometry (the heading, Where, When, Ratings, Photos, Summary, the actions); no shimmer. */
export default function Loading() {
  return <FormSkeleton label="Loading the form" />;
}
