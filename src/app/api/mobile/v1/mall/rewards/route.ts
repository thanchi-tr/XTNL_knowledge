import { handleMallRewards } from "@/lib/mobile-api-server";
import { realMallDeps } from "@/lib/mall-mobile-cores";

/**
 * The Android app's POST /api/mobile/v1/mall/rewards (docs/mobile-api.md): a reward listed, the Add sheet's save (blueprint P18).
 * Everything lives in src/lib/mobile-api-server.ts handleMallRewards (a route file may export only its methods and
 * segment config), which scripts/mobile-api-check.ts calls with fakes; mall-mobile-cores.ts binds the real cores (never
 * the paying ones: a Mall route holds only the Mall's read and its add).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleMallRewards(request, realMallDeps);
}
