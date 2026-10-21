import { handleCheck } from "@/lib/mobile-api-server";
import { realMobileDeps } from "@/lib/mobile-api-cores";

/**
 * The Android app's GET /api/mobile/v1/check (docs/mobile-api.md): the quick check, the app's home (today's board, the review counts, the due work, level, streak).
 * Everything lives in src/lib/mobile-api-server.ts handleCheck (a route file may export only its methods and segment
 * config), which scripts/mobile-api-check.ts calls with fakes; mobile-api-cores.ts binds the real cores.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleCheck(request, realMobileDeps);
}
