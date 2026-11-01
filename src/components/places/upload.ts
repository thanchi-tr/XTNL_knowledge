/**
 * One photo's upload (browser only): POST /places/photo as multipart — the visit, its place (ord), and the two blobs
 * photo-encode.ts drew (never the picked File, so none of its metadata is sent). The route answers JSON in the
 * places.ts PlacesResult shape; anything else (a lost connection, a proxy's page) is one plain line.
 */
import { PHOTO_PATH, SAVE_FAILED, type PlacesResult, type VisitPhoto } from "@/lib/places";
import type { EncodedPhoto } from "./types";

export const UPLOAD_UNREACHABLE = "Couldn't reach the server. Try again.";

export async function uploadPhoto(visitId: string, ord: number, photo: EncodedPhoto): Promise<PlacesResult<VisitPhoto>> {
  const form = new FormData();
  form.append("visitId", visitId);
  form.append("ord", String(ord));
  form.append("full", photo.full.blob, "photo.jpg");
  form.append("thumb", photo.thumb.blob, "thumb.jpg");
  let res: Response;
  try {
    res = await fetch(PHOTO_PATH, { method: "POST", body: form, credentials: "same-origin", cache: "no-store" });
  } catch {
    return { ok: false, error: UPLOAD_UNREACHABLE };
  }
  try {
    const body = (await res.json()) as unknown;
    if (body && typeof body === "object" && "ok" in body && typeof (body as { ok: unknown }).ok === "boolean") return body as PlacesResult<VisitPhoto>;
  } catch {
    // Not JSON: said plainly below.
  }
  return { ok: false, error: SAVE_FAILED };
}
