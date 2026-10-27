import { handleLiftSet } from "@/lib/mobile-api-server";
import { realLiftDeps } from "@/lib/lift-mobile-cores";

/**
 * The Android app's POST /api/mobile/v1/lift/set (docs/mobile-api.md): one "Set done" in the open lift (health phase 2),
 * through training-server logSetCore. Everything lives in src/lib/mobile-api-server.ts handleLiftSet (a route file may
 * export only its methods and segment config), which scripts/mobile-api-check.ts calls with fakes; lift-mobile-cores.ts
 * binds the lift logger's own cores (never the paying ones: a set is a record, and Finish stays on the web).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleLiftSet(request, realLiftDeps);
}
