"use client";

/**
 * The pages' bindings: the form and a visit's page with the router's navigation (a saved check-in opens its visit;
 * a deleted one goes back to Visits). Only these call useRouter, so the checks and the fixtures render PlaceForm and
 * VisitDetail with no router. Every URL here is a path with an id, never a value. The pages are force-dynamic, so a
 * navigation reads them fresh (the router keeps no dynamic page), and the writes have already cleared 'places'.
 */
import { useRouter } from "next/navigation";
import { PLACES_PATH, visitHref } from "@/lib/places";
import { PlaceForm } from "./PlaceForm";
import { VisitDetail } from "./VisitDetail";

type FormProps = Omit<Parameters<typeof PlaceForm>[0], "onDone" | "encode" | "upload">;
type DetailProps = Omit<Parameters<typeof VisitDetail>[0], "onDeleted">;

export function PlaceFormRoute(props: FormProps) {
  const router = useRouter();
  return (
    <PlaceForm
      {...props}
      onDone={(id) => router.push(visitHref(id))}
    />
  );
}

export function VisitDetailRoute(props: DetailProps) {
  const router = useRouter();
  return (
    <VisitDetail
      {...props}
      onDeleted={() => router.replace(PLACES_PATH)}
    />
  );
}
