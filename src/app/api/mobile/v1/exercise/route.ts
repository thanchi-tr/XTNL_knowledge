import { handleExercise } from "@/lib/mobile-api-server";
import { realMobileDeps } from "@/lib/mobile-api-cores";

/**
 * The Android app's POST /api/mobile/v1/exercise (docs/mobile-api.md): Health Connect's walks, hikes, workouts and
 * weigh-ins (blueprint P27; health D21: every kind but a walk a record), through health-ingest-server ingestHealthCore. Everything lives in src/lib/mobile-api-server.ts
 * handleExercise (a route file may export only its methods and segment config), which scripts/mobile-api-check.ts calls
 * with fakes; mobile-api-cores.ts binds the real cores.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleExercise(request, realMobileDeps);
}
