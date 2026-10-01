/**
 * The guided tour's contract with the rest of the app. Settings' "Replay the
 * tour" and the '?' help sheet's "Take the tour" dispatch TOUR_START_EVENT on
 * window; the tour (src/components/tour) listens for it. TOUR_SEEN_KEY in
 * localStorage records that this device has seen it, so it starts by itself
 * only once.
 */
export const TOUR_START_EVENT = "xtnl:tour:start";
export const TOUR_SEEN_KEY = "xtnl:tour:seen";

/** Starts the tour from anywhere on the client (a no-op on the server). */
export function startTour(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TOUR_START_EVENT));
}
