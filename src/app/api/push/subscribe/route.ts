import { handleSubscribe, handleUnsubscribe } from "@/lib/push-server";

/**
 * This browser's web-push subscription (call back reminders; src/lib/push-client.ts calls it).
 *
 *   POST   PushSubscription.toJSON()  → { saved: true }    upsert by endpoint for the current user
 *   DELETE { endpoint }               → { removed: 0 | 1 }
 *
 * JSON from this site only; the endpoint must be a real push service's. Everything lives in
 * src/lib/push-server.ts (a route file may export only its methods and segment config), which
 * scripts/push-check.ts calls with a fake store.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleSubscribe(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleUnsubscribe(request);
}
