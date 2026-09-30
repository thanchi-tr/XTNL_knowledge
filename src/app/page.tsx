import { redirect } from "next/navigation";

/**
 * The root lands on Today.
 *
 * It used to land on Review, on the reasoning that the app was used in
 * short sittings whose whole purpose was clearing the due queue. That is
 * still the first thing most sittings do — which is why the review queue is
 * the first card on the Today board, one tap from the same place. But the
 * app now also carries the day's todos, habits and duties, and a root that
 * opened on the queue hid every one of them behind a click.
 *
 * A redirect rather than rendering the board here, so Today keeps one
 * canonical URL that can be linked, bookmarked and put on a home screen.
 * Reverting is this one line, should the board ever stop earning the front
 * door.
 */
export default function RootPage() {
  redirect("/today");
}
