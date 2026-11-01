import type { PlacesResult, VisitPhoto } from "@/lib/places";
import type { SavedVisit } from "@/lib/places-server";
import type { PlacesActionOptions, SaveVisitInput } from "@/app/actions/places";

/**
 * Places' writes, passed in by the pages (the server actions in src/app/actions/places.ts) or by a fixture
 * (/dev/style/places), so no Places component imports a server module itself. Type-only imports: nothing here reaches
 * the client bundle, the database or anything that reaches Gemini.
 */
export interface VisitFormActions {
  saveVisit: (input: SaveVisitInput, opts?: PlacesActionOptions) => Promise<PlacesResult<SavedVisit>>;
  /** `remove`: the stored photos the edit removes, by their full image's id. */
  updateVisit: (id: string, input: SaveVisitInput, remove: string[], opts?: PlacesActionOptions) => Promise<PlacesResult<SavedVisit>>;
}

export type DeleteVisit = (id: string, opts?: PlacesActionOptions) => Promise<PlacesResult<{ deleted: number }>>;

/** One image the browser drew and re-encoded: its JPEG and its pixels. */
export interface EncodedImage {
  blob: Blob;
  width: number;
  height: number;
}

/** A picked photo after the browser's resize: the photo (long edge ≤ 1600) and its thumbnail (≤ 480). */
export interface EncodedPhoto {
  full: EncodedImage;
  thumb: EncodedImage;
}

/** Turns a picked file into an EncodedPhoto (photo-encode.ts encodePhoto; a fixture may pass its own). */
export type EncodePhoto = (file: File) => Promise<PlacesResult<EncodedPhoto>>;

/** Sends one encoded photo into one of a visit's places (upload.ts uploadPhoto; a fixture fakes it). */
export type UploadPhoto = (visitId: string, ord: number, photo: EncodedPhoto) => Promise<PlacesResult<VisitPhoto>>;

export type { PlacesActionOptions, SaveVisitInput, SavedVisit };
