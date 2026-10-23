import { handleMallUndo } from "@/lib/mobile-api-server";
import { realMallDeps } from "@/lib/mall-mobile-cores";

/**
 * The Android app's POST /api/mobile/v1/mall/undo (docs/mobile-api.md): a purchase undone inside its ten minutes, its
 * credits back (blueprint P19). Everything lives in src/lib/mobile-api-server.ts handleMallUndo (a route file may export
 * only its methods and segment config), which scripts/mobile-api-check.ts calls with fakes; mall-mobile-cores.ts binds
 * the real cores (never the paying ones).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleMallUndo(request, realMallDeps);
}
