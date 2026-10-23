import { handleStatus } from "@/lib/mobile-api-server";
import { realMobileDeps } from "@/lib/mobile-api-cores";

/**
 * The Android app's GET /api/mobile/v1/status (docs/mobile-api.md): the /you Status card's five attributes and Capital's
 * reading (blueprint P1), the avatar targets (P4) and the skills (P5), read only.
 * Everything lives in src/lib/mobile-api-server.ts handleStatus (a route file may export only its methods and segment
 * config), which scripts/mobile-api-check.ts calls with fakes; mobile-api-cores.ts binds the real cores.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleStatus(request, realMobileDeps);
}
