import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/components/places/places.css";
import { getCurrentUserId } from "@/lib/user";
import { isVisitId } from "@/lib/places";
import { loadVisitDetail } from "@/lib/places-server";
import { deleteVisit } from "@/app/actions/places";
import { VisitDetailRoute } from "@/components/places/PlacesRoutes";

// One visit of the user's own: never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Visit" };

/**
 * Places › a visit: its photos large, the four ratings and the overall, the summary, where, Edit, Delete behind a
 * confirm, and the other visits to the same place. loadVisitDetail is cached under 'places' and fails soft; a visit
 * that isn't there says so in one line (an id that can't be one is a 404).
 */
export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isVisitId(id)) notFound();
  const detail = await loadVisitDetail(getCurrentUserId(), id, new Date());
  return (
    <div className="page narrow">
      <VisitDetailRoute detail={detail} deleteVisit={deleteVisit} />
    </div>
  );
}
