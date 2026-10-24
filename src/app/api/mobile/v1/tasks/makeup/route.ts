import { handleTaskMakeUp } from "@/lib/mobile-api-server";
import { realMobileDeps } from "@/lib/mobile-api-cores";

/**
 * The Android app's POST /api/mobile/v1/tasks/makeup (docs/mobile-api.md): an owed card's action (blueprint P22), through
 * actions/duty makeUp, doMinimum, acceptLoss and undoMakeUp. Everything lives in src/lib/mobile-api-server.ts handleTaskMakeUp (a
 * route file may export only its methods and segment config), which scripts/mobile-api-check.ts calls with fakes;
 * mobile-api-cores.ts binds the real cores.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleTaskMakeUp(request, realMobileDeps);
}
