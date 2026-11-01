import type { Metadata } from "next";
import "@/components/places/places.css";
import { getCurrentUserId } from "@/lib/user";
import { PLACES_NOT_READY, PLACES_PATH, blankDraft, knownPlacesOf } from "@/lib/places";
import { loadPlacesView } from "@/lib/places-server";
import { saveVisit, updateVisit } from "@/app/actions/places";
import { PlaceFormRoute } from "@/components/places/PlacesRoutes";

// The form starts at the server's now (the life zone's clock), and its suggestions are the user's own places.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Check in" };

/**
 * Places › Check in: the form (src/components/places/PlaceForm.tsx), starting now, with the user's places offered as
 * the name is typed. Saving opens the new visit. Before the migration the form says so in one plain line (a save
 * would answer the same line).
 */
export default async function NewVisitPage() {
  const now = new Date();
  const view = await loadPlacesView(getCurrentUserId(), now);
  return (
    <div className="page narrow">
      <div className="pl-page">
        <h1 className="t-display-m pl-note">Check in</h1>
        <PlaceFormRoute
          mode="new"
          draft={blankDraft(now)}
          actions={{ saveVisit, updateVisit }}
          knownPlaces={knownPlacesOf(view.visits)}
          notice={view.ready ? null : view.failed ? null : PLACES_NOT_READY}
          cancelHref={PLACES_PATH}
        />
      </div>
    </div>
  );
}
