import { handleReviewQueue } from "@/lib/mobile-api-server";
import { realMobileDeps } from "@/lib/mobile-api-cores";

/**
 * The Android app's GET /api/mobile/v1/review/queue (docs/mobile-api.md): the cards due now, in the web runner's order and wording.
 * Everything lives in src/lib/mobile-api-server.ts handleReviewQueue (a route file may export only its methods and segment
 * config), which scripts/mobile-api-check.ts calls with fakes; mobile-api-cores.ts binds the real cores.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleReviewQueue(request, realMobileDeps);
}
