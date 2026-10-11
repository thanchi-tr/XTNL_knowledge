import { handleTestPush } from "@/lib/push-server";

/**
 * Settings › Notifications' "Send a test" (src/components/settings/NotificationsSection.tsx calls it).
 *
 *   POST {}  → { subscriptions, sent, removed, failed, skipped }   to every device the current user turned on
 *            → 429 { retryAfter }                                  more than once a minute
 *
 * JSON from this site only. Everything lives in src/lib/push-server.ts handleTestPush (a route file may export
 * only its methods and segment config), which scripts/push-check.ts calls with fakes.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleTestPush(request);
}
