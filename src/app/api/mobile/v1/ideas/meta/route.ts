import { handleIdeasMeta } from "@/lib/mobile-api-server";
import { realMobileDeps } from "@/lib/mobile-api-cores";

/**
 * The Android app's GET /api/mobile/v1/ideas/meta (docs/mobile-api.md): what the New idea form offers (its seven formats and the collections).
 * Everything lives in src/lib/mobile-api-server.ts handleIdeasMeta (a route file may export only its methods and segment
 * config), which scripts/mobile-api-check.ts calls with fakes; mobile-api-cores.ts binds the real cores.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleIdeasMeta(request, realMobileDeps);
}
