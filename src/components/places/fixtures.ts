/**
 * Places' fixtures (/dev/style/places, and scripts/places-check.ts): made-up visits on a fixed day, so the list, the
 * form and a visit's page can be drawn with no database. Pure. The photos are small SVG pictures in data: URIs at the
 * stored sizes (a photo 1600 × 1200, its thumbnail 480 × 360), so nothing is fetched.
 *
 *   PLACES_FIXTURE_STATES   the ?state= names (each drawn alone; no state draws them all), so the audit measures
 *                           every state at 344: the list (empty, grouped, a group opened, no match, not ready,
 *                           failed), the form (empty, filled, not ready, its photo tiles preparing, refused and not
 *                           sent, the unsent footer, the location refused) and a visit (four photos, two ratings, the
 *                           Delete confirm open, not ready, gone)
 *   PLACES_FIXTURE_NOW      the fixtures' instant (Sunday 1 November 2026, 12:30 in Sydney)
 *   PHOTO_STATE_PICKS · UNSENT_PICKS   the form's new-photo tiles for those states (a fixture's only)
 */
import { dayKeyOf } from "@/lib/life-day";
import {
  NO_RATINGS,
  PHOTO_NOT_IMAGE,
  PHOTO_TOO_BIG,
  emptyPlacesView,
  emptyVisitDetail,
  overallOf,
  placeKeyOf,
  type PhotoImage,
  type PlacesView,
  type Ratings,
  type VisitDetail,
  type VisitPhoto,
  type VisitView,
} from "@/lib/places";
import type { NewPick } from "./PhotoPicker";

export const PLACES_FIXTURE_STATES = [
  "list-empty",
  "list-grouped",
  "list-group-open",
  "list-no-match",
  "list-not-ready",
  "list-failed",
  "form-empty",
  "form-filled",
  "form-not-ready",
  "form-photo-states",
  "form-unsent",
  "form-location-off",
  "visit-four-photos",
  "visit-two-ratings",
  "visit-delete-armed",
  "visit-not-ready",
  "visit-gone",
] as const;
export type PlacesFixtureState = (typeof PLACES_FIXTURE_STATES)[number];

export function isPlacesFixtureState(v: unknown): v is PlacesFixtureState {
  return typeof v === "string" && (PLACES_FIXTURE_STATES as readonly string[]).includes(v);
}

/** Sunday 1 November 2026, 12:30 in Sydney (01:30 UTC). */
export const PLACES_FIXTURE_NOW = new Date("2026-11-01T01:30:00.000Z");
export const PLACES_FIXTURE_TODAY = dayKeyOf(PLACES_FIXTURE_NOW);

/** A picture of a hill and a sun, the sun moved along by `n` so four photos are told apart. Neutral greys only. */
function picture(n: number, width: number, height: number): string {
  const sun = 30 + ((n * 37) % 100);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 160 120">` +
    `<rect width="160" height="120" fill="#2b303b"/>` +
    `<circle cx="${sun}" cy="34" r="13" fill="#c3cad8"/>` +
    `<path d="M0 120 L${40 + n * 6} 62 L80 92 L${108 - n * 4} 56 L160 120 Z" fill="#6f788c"/>` +
    `<text x="10" y="112" font-family="sans-serif" font-size="14" fill="#f1f3f8">${n + 1}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function image(id: string, n: number, width: number, height: number): PhotoImage {
  return { id, src: picture(n, width, height), width, height };
}

/** A visit's n photos in order, each with its thumbnail. */
export function fixturePhotos(visitId: string, n: number): VisitPhoto[] {
  return Array.from({ length: n }, (_, i) => ({
    ord: i,
    full: image(`${visitId}-p${i}`, i, 1600, 1200),
    thumb: image(`${visitId}-t${i}`, i, 480, 360),
  }));
}

function visit(o: {
  id: string;
  placeName: string;
  at: string;
  ratings?: Partial<Ratings>;
  summary?: string | null;
  address?: string | null;
  photos?: number;
  location?: VisitView["location"];
}): VisitView {
  const ratings = { ...NO_RATINGS, ...o.ratings };
  const photos = o.photos ?? 0;
  const at = new Date(o.at);
  return {
    id: o.id,
    placeName: o.placeName,
    placeKey: placeKeyOf(o.placeName),
    address: o.address ?? null,
    location: o.location ?? null,
    visitedAt: at.toISOString(),
    day: dayKeyOf(at),
    ratings,
    overall: overallOf(ratings),
    summary: o.summary ?? null,
    photoCount: photos,
    thumb: photos > 0 ? fixturePhotos(o.id, 1)[0].thumb : null,
  };
}

/** Café Lumen, three times (its name typed three ways: one place); the latest has four photos and no parking. */
export const LUMEN_LATEST = visit({
  id: "fx-lumen-3",
  placeName: "Café Lumen",
  at: "2026-10-31T02:05:00.000Z",
  ratings: { service: 5, food: 4, premises: 4, parking: null },
  summary: "Flat white was spot on and the window seats get the morning sun.\nBusy after 10, so go early.",
  address: "12 Harbour Lane, Balmain NSW",
  photos: 4,
  location: { lat: -33.8588, lng: 151.1801, accuracyM: 12 },
});
const LUMEN_2 = visit({ id: "fx-lumen-2", placeName: "cafe lumen", at: "2026-10-20T22:40:00.000Z", ratings: { service: 4, food: 4, premises: 4 }, summary: "Good again. The banana bread is worth it.", photos: 1 });
const LUMEN_1 = visit({ id: "fx-lumen-1", placeName: "CAFE  Lumen", at: "2026-09-27T23:15:00.000Z", ratings: { service: 3, food: 4, premises: 3, parking: 2 }, summary: "First time. Parking was hard to find." });
/** Two ratings only (no premises, no parking): the overall is their mean. */
export const FISH_BAR = visit({
  id: "fx-fish",
  placeName: "Harbour Fish Bar",
  at: "2026-10-29T08:20:00.000Z",
  ratings: { service: 3, food: 5 },
  summary: "Best chips in a while.\nThe queue moves fast.",
  photos: 2,
});
const POOL = visit({ id: "fx-pool", placeName: "Northside Pool", at: "2026-10-25T21:00:00.000Z", summary: "Lanes were quiet before 8." });
const DINER = visit({
  id: "fx-diner",
  placeName: "Joe’s Garage Diner — a long name that has to wrap at 344 without spilling past its card",
  at: "2025-12-14T07:30:00.000Z",
  ratings: { service: 4, food: 3, premises: 2, parking: 5 },
  summary: "A very long first line of a summary that runs on well past the width of a phone so the card has to cut it with an ellipsis rather than wrap it.",
  photos: 1,
});

export const FIXTURE_VISITS: readonly VisitView[] = [LUMEN_LATEST, FISH_BAR, POOL, LUMEN_2, LUMEN_1, DINER];

const GROUPED: PlacesView = { ready: true, failed: false, today: PLACES_FIXTURE_TODAY, visits: [...FIXTURE_VISITS] };

/** The list's states. A group opened and no match are the grouped list drawn with a fixture's opening (PlacesList's initiallyOpen, initialQuery). */
export const LIST_FIXTURES: Readonly<Record<"list-empty" | "list-grouped" | "list-group-open" | "list-no-match" | "list-not-ready" | "list-failed", PlacesView>> = {
  "list-empty": { ...emptyPlacesView(PLACES_FIXTURE_TODAY, { ready: true }) },
  "list-grouped": GROUPED,
  "list-group-open": GROUPED,
  "list-no-match": GROUPED,
  "list-not-ready": emptyPlacesView(PLACES_FIXTURE_TODAY, { ready: false }),
  "list-failed": emptyPlacesView(PLACES_FIXTURE_TODAY, { ready: false, failed: true }),
};

/** The search no-match fixture types this (nothing in the fixtures holds it). */
export const NO_MATCH_QUERY = "zzz";

const TWO_RATINGS: VisitDetail = { ready: true, failed: false, today: PLACES_FIXTURE_TODAY, visit: FISH_BAR, photos: fixturePhotos(FISH_BAR.id, 2), others: [] };

/** A visit's states. The Delete confirm open is the two-ratings visit drawn with VisitDetail's initiallyArmed. */
export const DETAIL_FIXTURES: Readonly<Record<"visit-four-photos" | "visit-two-ratings" | "visit-delete-armed" | "visit-not-ready" | "visit-gone", VisitDetail>> = {
  "visit-four-photos": { ready: true, failed: false, today: PLACES_FIXTURE_TODAY, visit: LUMEN_LATEST, photos: fixturePhotos(LUMEN_LATEST.id, 4), others: [LUMEN_2, LUMEN_1] },
  "visit-two-ratings": TWO_RATINGS,
  "visit-delete-armed": TWO_RATINGS,
  "visit-not-ready": emptyVisitDetail(PLACES_FIXTURE_TODAY, { ready: false }),
  "visit-gone": emptyVisitDetail(PLACES_FIXTURE_TODAY, { ready: true }),
};

/** A new photo's tile in the form, as a fixture draws it (no encoded photo: a fixture sends nothing). */
function pick(key: string, status: NewPick["status"], error: string | null, preview = false): NewPick {
  const thumb = fixturePhotos(key, 1)[0].thumb;
  return { kind: "new", key, status, preview: preview && thumb ? thumb.src : null, width: preview ? 480 : 1, height: preview ? 360 : 1, photo: null, error, ord: status === "unsent" ? 0 : null };
}

/** The form's tiles: one preparing, one that isn't an image, one too large after resizing, and one not sent yet (four: the most). */
export const PHOTO_STATE_PICKS: readonly NewPick[] = [
  pick("fx-encoding", "encoding", null),
  pick("fx-not-image", "failed", PHOTO_NOT_IMAGE),
  pick("fx-too-big", "failed", PHOTO_TOO_BIG),
  pick("fx-unsent", "unsent", "Couldn't reach the server. Try again.", true),
];

/** The unsent footer's one photo that didn't send. */
export const UNSENT_PICKS: readonly NewPick[] = [pick("fx-unsent-1", "unsent", "Couldn't reach the server. Try again.", true)];
