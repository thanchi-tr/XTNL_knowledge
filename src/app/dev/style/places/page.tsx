import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/components/places/places.css";
import { devStyleEnabled } from "../gate";
import { isPlacesFixtureState } from "@/components/places/fixtures";
import { PlacesFixtures } from "./PlacesFixtures";

export const metadata: Metadata = { title: "Places fixtures" };

/**
 * /dev/style/places: Places on fixtures (src/components/places/fixtures.ts) with fake actions that save nothing: the
 * list (empty, a place visited three times grouped, that group opened, no match, not ready, failed), the form (empty,
 * Edit filled with four stored photos, not ready, its photo tiles, the unsent footer, the location refused), and a
 * visit (four photos with its other visits, only two ratings, the Delete confirm open, not ready, gone). ?state= is one
 * of PLACES_FIXTURE_STATES (a fixed name, never a value) and draws that state alone. Gated like every /dev/style page.
 */
export default async function DevStylePlacesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!devStyleEnabled()) notFound();
  const raw = (await searchParams).state;
  const state = isPlacesFixtureState(raw) ? raw : null;
  return <PlacesFixtures state={state} />;
}
