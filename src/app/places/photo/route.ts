import { handlePhotoUpload } from "@/lib/places-server";

/**
 * POST /places/photo: one photo of a visit and its thumbnail, both resized and re-encoded in the browser
 * (src/components/places/photo-encode.ts), as multipart (visitId, ord, full, thumb). One photo a request, under
 * places.ts UPLOAD_MAX_BYTES, so no Server Action's body limit is raised. Same site only; everything lives in
 * src/lib/places-server.ts (a route file may export only its methods and segment config), which
 * scripts/places-check.ts calls on a stubbed client.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handlePhotoUpload(request);
}
