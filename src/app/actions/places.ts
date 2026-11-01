"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { cleanPhotoIds, isVisitId, type PlaceLocation, type RatingKey } from "@/lib/places";
import { deleteVisitCore, placesErrorTag, saveVisitCore, updateVisitCore, type PlacesResult, type SavedVisit } from "@/lib/places-server";

/**
 * Places' actions: save a check-in, edit one (its fields, and which stored photos it removes), and delete one with its
 * photos. The photos themselves go to POST /places/photo (a route handler: one photo a request, under its own cap, so
 * no Server Action's body limit is raised). A record, never a reward: none of these pays anything, ticks a streak,
 * keeps a quest or returns a moment, whatever the ratings.
 *
 * Nothing the browser sends is trusted: the input is copied field by field (anything else is dropped), and the core
 * checks it again (places.ts cleanVisitInput). The writes invalidate the process cache's 'places' tag; like the
 * check-in's actions, `{ refresh: true }` also re-renders the current route in the same response (refresh() is a Server
 * Action call only, and does not revalidate tagged data, which is why the cores invalidate). Each returns { ok, value }
 * or { ok: false, error } and never throws, and no log line carries a value.
 */

export interface PlacesActionOptions {
  /** Re-render the current route in this response. */
  refresh?: boolean;
}

export interface SaveVisitInput {
  placeName: string;
  address?: string | null;
  /** Only from a "Use my location" tap. */
  location?: PlaceLocation | null;
  /** A datetime-local value on the life zone's clock ('2026-11-01T13:05'). */
  visitedLocal: string;
  /** 1..5 each, or null / 0 / omitted for Not rated. */
  ratings?: Partial<Record<RatingKey, number | null>>;
  summary?: string | null;
  /** A UUID the form makes once per check-in and sends on every retry. */
  clientId: string;
}

async function run<T>(label: string, opts: PlacesActionOptions | undefined, fn: (userId: string) => Promise<PlacesResult<T>>): Promise<PlacesResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed: ${placesErrorTag(err)}`);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

/**
 * The input copied by name: nothing else the browser sent reaches the core. The ratings are copied key by key only
 * when they are a plain object; anything else (an array, a string, a number) goes through as it came, so the core's
 * cleanRatings refuses it (RATING_BAD) rather than reading it as four Not rated.
 */
function copyOf(input: SaveVisitInput) {
  const raw = input.ratings as unknown;
  const r = raw as Record<string, unknown>;
  const ratings = raw && typeof raw === "object" && !Array.isArray(raw) ? { service: r.service, food: r.food, premises: r.premises, parking: r.parking } : raw;
  const loc = input.location && typeof input.location === "object" ? { lat: input.location.lat, lng: input.location.lng, accuracyM: input.location.accuracyM } : input.location;
  return {
    placeName: input.placeName,
    address: input.address,
    location: loc,
    visitedLocal: input.visitedLocal,
    ratings,
    summary: input.summary,
    clientId: input.clientId,
  };
}

/** Saves one new check-in. A resend with the same clientId answers the first one (replay: true). */
export async function saveVisit(input: SaveVisitInput, opts?: PlacesActionOptions): Promise<PlacesResult<SavedVisit>> {
  return run("saveVisit", opts, async (userId) => {
    if (!input || typeof input !== "object") return { ok: false, error: "Nothing to save." };
    return saveVisitCore(userId, copyOf(input), new Date());
  });
}

/**
 * Edits one visit: its fields, and its stored photos: the ones named in `remove` (their full image's id, never a
 * place, so a retry after a lost answer removes nothing more) go, and the rest close up from 0.
 */
export async function updateVisit(id: string, input: SaveVisitInput, remove: string[], opts?: PlacesActionOptions): Promise<PlacesResult<SavedVisit>> {
  return run("updateVisit", opts, async (userId) => {
    if (!isVisitId(id)) return { ok: false, error: "That visit isn't here." };
    if (!input || typeof input !== "object") return { ok: false, error: "Nothing to save." };
    return updateVisitCore(userId, id, copyOf(input), cleanPhotoIds(remove), new Date());
  });
}

/** Deletes one visit and its photos. It can't be undone (the page asks first). One already gone answers deleted: 0. */
export async function deleteVisit(id: string, opts?: PlacesActionOptions): Promise<PlacesResult<{ deleted: number }>> {
  return run("deleteVisit", opts, async (userId) => {
    if (!isVisitId(id)) return { ok: false, error: "That visit isn't here." };
    return deleteVisitCore(userId, id);
  });
}
