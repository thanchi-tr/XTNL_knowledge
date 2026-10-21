import { handleWorkReopen } from "@/lib/mobile-api-server";
import { realMobileDeps } from "@/lib/mobile-api-cores";

/**
 * The Android app's POST /api/mobile/v1/work/reopen (docs/mobile-api.md): Done's Undo, through actions/scheduled-tasks reopenScheduledTask.
 * Everything lives in src/lib/mobile-api-server.ts handleWorkReopen (a route file may export only its methods and segment
 * config), which scripts/mobile-api-check.ts calls with fakes; mobile-api-cores.ts binds the real cores.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleWorkReopen(request, realMobileDeps);
}
