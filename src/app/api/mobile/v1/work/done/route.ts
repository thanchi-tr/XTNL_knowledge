import { handleWorkDone } from "@/lib/mobile-api-server";
import { realMobileDeps } from "@/lib/mobile-api-cores";

/**
 * The Android app's POST /api/mobile/v1/work/done (docs/mobile-api.md): a scheduled task's Done, through actions/scheduled-tasks doneScheduledTask (no history log).
 * Everything lives in src/lib/mobile-api-server.ts handleWorkDone (a route file may export only its methods and segment
 * config), which scripts/mobile-api-check.ts calls with fakes; mobile-api-cores.ts binds the real cores.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleWorkDone(request, realMobileDeps);
}
