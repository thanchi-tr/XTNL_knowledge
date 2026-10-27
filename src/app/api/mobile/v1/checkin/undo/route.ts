import { handleCheckinUndo } from "@/lib/mobile-api-server";
import { realMindDeps } from "@/lib/mind-mobile-cores";

/**
 * The Android app's POST /api/mobile/v1/checkin/undo (docs/mobile-api.md): a check-in's receipt Undo (health phase 2),
 * through mind-server deleteCheckCore. Everything lives in src/lib/mobile-api-server.ts handleCheckinUndo (a route file
 * may export only its methods and segment config), which scripts/mobile-api-check.ts calls with fakes;
 * mind-mobile-cores.ts binds Mind's own cores (never the paying ones).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleCheckinUndo(request, realMindDeps);
}
