import type { Metadata } from "next";
import "@/components/places/places.css";
import { getCurrentUserId } from "@/lib/user";
import { loadPlacesView } from "@/lib/places-server";
import { PlacesList } from "@/components/places/PlacesList";

// The list is the user's own rows, and its day words turn over with the life day (04:00): never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Places" };

/**
 * Places › Visits (the user's request of 2026-11-01): every check-in, newest first, a place visited more than once
 * grouped with its count and average, a search box, and Check in. A read only: loadPlacesView (cached under
 * 'places', every write invalidates it) reads the visits and their thumbnails' sizes, never a photo's bytes, and
 * fails soft (not ready before the migration, a plain line when the read fails). A record, never a reward: nothing
 * here pays, and nothing in the economy reads it.
 */
export default async function PlacesPage() {
  const view = await loadPlacesView(getCurrentUserId(), new Date());
  return (
    <div className="page narrow">
      <PlacesList view={view} />
    </div>
  );
}
