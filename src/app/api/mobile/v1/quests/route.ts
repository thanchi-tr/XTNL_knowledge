import { handleQuests } from "@/lib/mobile-api-server";
import { realMobileDeps } from "@/lib/mobile-api-cores";

/**
 * The Android app's GET /api/mobile/v1/quests (docs/mobile-api.md): the main quest, this week's sprint and Today's three, read only (blueprint P15).
 * Everything lives in src/lib/mobile-api-server.ts handleQuests (a route file may export only its methods and segment
 * config), which scripts/mobile-api-check.ts calls with fakes; mobile-api-cores.ts binds the real cores.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleQuests(request, realMobileDeps);
}
