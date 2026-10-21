import { handleTaskComplete } from "@/lib/mobile-api-server";
import { realMobileDeps } from "@/lib/mobile-api-cores";

/**
 * The Android app's POST /api/mobile/v1/tasks/complete (docs/mobile-api.md): a tick, through actions/tasks completeTask.
 * Everything lives in src/lib/mobile-api-server.ts handleTaskComplete (a route file may export only its methods and segment
 * config), which scripts/mobile-api-check.ts calls with fakes; mobile-api-cores.ts binds the real cores.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleTaskComplete(request, realMobileDeps);
}
