import { handleMallBuy } from "@/lib/mobile-api-server";
import { realMallDeps } from "@/lib/mall-mobile-cores";

/**
 * The Android app's POST /api/mobile/v1/mall/buy (docs/mobile-api.md): Buy's Confirm, a reward bought for its price in
 * credits (blueprint P19). Everything lives in src/lib/mobile-api-server.ts handleMallBuy (a route file may export only
 * its methods and segment config), which scripts/mobile-api-check.ts calls with fakes; mall-mobile-cores.ts binds the
 * real cores (never the paying ones: a purchase spends credits only).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleMallBuy(request, realMallDeps);
}
