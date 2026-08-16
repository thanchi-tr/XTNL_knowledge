import { loadNotifications } from "@/lib/notifications";
import { getCurrentUserId } from "@/lib/user";
import { NotificationBubble } from "./NotificationBubble";

/**
 * Server wrapper for the corner bubble, mounted in the root layout beside
 * `LoadoutBarSlot`.
 *
 * Passed as a *prop* into `StreakProvider` and never wrapped in `<Suspense>`,
 * for the reason documented in layout.tsx: a Suspense boundary in this
 * position renders its markup but never hydrates, which here would leave a
 * button that cannot be opened. Failing silently to `null` on error keeps a
 * notification panel from ever being the thing that takes the app down.
 */
export async function NotificationSlot() {
  // Only the *fetch* is guarded. Constructing the JSX inside the try would
  // also swallow render errors from the bubble itself, turning a real bug
  // into a silently missing panel.
  let feed: Awaited<ReturnType<typeof loadNotifications>> | null = null;
  try {
    feed = await loadNotifications(getCurrentUserId());
  } catch {
    return null;
  }

  if (!feed || feed.notices.length === 0) return null;
  return <NotificationBubble feed={feed} />;
}
