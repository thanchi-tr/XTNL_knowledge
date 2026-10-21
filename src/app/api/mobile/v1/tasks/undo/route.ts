import { handleTaskUndo } from "@/lib/mobile-api-server";
import { realMobileDeps } from "@/lib/mobile-api-cores";

/**
 * The Android app's POST /api/mobile/v1/tasks/undo (docs/mobile-api.md): a tick's Undo, through actions/tasks undoCompletion.
 * Everything lives in src/lib/mobile-api-server.ts handleTaskUndo (a route file may export only its methods and segment
 * config), which scripts/mobile-api-check.ts calls with fakes; mobile-api-cores.ts binds the real cores.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleTaskUndo(request, realMobileDeps);
}
