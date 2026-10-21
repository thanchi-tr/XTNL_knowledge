import { handleLog } from "@/lib/mobile-api-server";
import { realMobileDeps } from "@/lib/mobile-api-cores";

/**
 * The Android app's POST /api/mobile/v1/log (docs/mobile-api.md): one quick-log line, through the capture sheet's actions/capture createFromCapture.
 * Everything lives in src/lib/mobile-api-server.ts handleLog (a route file may export only its methods and segment
 * config), which scripts/mobile-api-check.ts calls with fakes; mobile-api-cores.ts binds the real cores.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleLog(request, realMobileDeps);
}
