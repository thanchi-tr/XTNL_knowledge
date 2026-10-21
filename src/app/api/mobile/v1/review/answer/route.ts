import { handleReviewAnswer } from "@/lib/mobile-api-server";
import { realMobileDeps } from "@/lib/mobile-api-cores";

/**
 * The Android app's POST /api/mobile/v1/review/answer (docs/mobile-api.md): one answer, graded and paid by actions/review submitReview.
 * Everything lives in src/lib/mobile-api-server.ts handleReviewAnswer (a route file may export only its methods and segment
 * config), which scripts/mobile-api-check.ts calls with fakes; mobile-api-cores.ts binds the real cores.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleReviewAnswer(request, realMobileDeps);
}
