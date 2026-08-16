import { redirect } from "next/navigation";

/**
 * The root lands on Review.
 *
 * This app is used in short, frequent sittings whose whole purpose is
 * clearing the due queue — the overview is something you consult
 * occasionally, not the thing you came to do. Opening on a dashboard meant
 * every session started with a click that was the same click every time.
 *
 * A redirect rather than rendering Review here, so the review screen keeps
 * one canonical URL that can be linked, bookmarked and reasoned about.
 */
export default function RootPage() {
  redirect("/review");
}
