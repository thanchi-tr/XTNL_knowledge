import { handleMall } from "@/lib/mobile-api-server";
import { realMallDeps } from "@/lib/mall-mobile-cores";

/**
 * The Android app's GET /api/mobile/v1/mall (docs/mobile-api.md): You › Mall's catalog and the credits over it, read only (blueprint P18).
 * Everything lives in src/lib/mobile-api-server.ts handleMall (a route file may export only its methods and segment
 * config), which scripts/mobile-api-check.ts calls with fakes; mall-mobile-cores.ts binds the real cores (never the
 * paying ones: a Mall route holds only the Mall's read and its add).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleMall(request, realMallDeps);
}
