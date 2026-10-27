import { handleCheckin } from "@/lib/mobile-api-server";
import { realMindDeps } from "@/lib/mind-mobile-cores";

/**
 * The Android app's POST /api/mobile/v1/checkin (docs/mobile-api.md): the 5-second check-in (health phase 2), through
 * mind-server logCheckCore. Everything lives in src/lib/mobile-api-server.ts handleCheckin (a route file may export only
 * its methods and segment config), which scripts/mobile-api-check.ts calls with fakes; mind-mobile-cores.ts binds Mind's
 * own cores (never the paying ones: a check-in is a record, never a reward).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleCheckin(request, realMindDeps);
}
