import { handlePhotoGet } from "@/lib/places-server";

/**
 * GET /places/photo/<id>: one stored image of a visit (a photo or its thumbnail) with its own Content-Type and an
 * immutable, private cache (an id is never reused: a replaced photo is a new row). Never served to another site.
 * Everything lives in src/lib/places-server.ts handlePhotoGet.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return handlePhotoGet(request, id);
}
