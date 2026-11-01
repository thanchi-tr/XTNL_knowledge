import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/components/places/places.css";
import { getCurrentUserId } from "@/lib/user";
import { PLACES_LOAD_FAILED, PLACES_NOT_READY, PLACES_PATH, VISIT_GONE, draftOfVisit, isVisitId, visitHref } from "@/lib/places";
import { loadVisitDetail } from "@/lib/places-server";
import { saveVisit, updateVisit } from "@/app/actions/places";
import { PlaceFormRoute } from "@/components/places/PlacesRoutes";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit visit" };

/**
 * Places › a visit's Edit: the same form, filled from the visit, its stored photos each with Remove. Saving keeps
 * the photos left (closed up in their order) and sends the new ones after them, then opens the visit again.
 */
export default async function EditVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isVisitId(id)) notFound();
  const detail = await loadVisitDetail(getCurrentUserId(), id, new Date());
  if (!detail.ready || !detail.visit) {
    const line = !detail.ready ? (detail.failed ? PLACES_LOAD_FAILED : PLACES_NOT_READY) : VISIT_GONE;
    return (
      <div className="page narrow">
        <div className="pl-page">
          <p className="t-body pl-note">{line}</p>
          <div className="pl-acts">
            <Button variant="secondary" href={PLACES_PATH} icon="back">
              All visits
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="page narrow">
      <div className="pl-page">
        <h1 className="t-display-m pl-note pl-title">{detail.visit.placeName}</h1>
        <PlaceFormRoute mode="edit" visitId={detail.visit.id} draft={draftOfVisit(detail.visit, detail.photos)} actions={{ saveVisit, updateVisit }} cancelHref={visitHref(detail.visit.id)} />
      </div>
    </div>
  );
}
