import { handleTaskStart } from "@/lib/mobile-api-server";
import { realMobileDeps } from "@/lib/mobile-api-cores";

/**
 * The Android app's POST /api/mobile/v1/tasks/start (docs/mobile-api.md): a proof task's timer (blueprint P23), through
 * actions/tasks startTaskTimer. Everything lives in src/lib/mobile-api-server.ts handleTaskStart (a route file may
 * export only its methods and segment config), which scripts/mobile-api-check.ts calls with fakes; mobile-api-cores.ts
 * binds the real cores.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleTaskStart(request, realMobileDeps);
}
