"use client";

/**
 * Places' fixture views (src/components/places/fixtures.ts): the list empty, grouped (a place visited three times,
 * its name typed three ways), with that group opened, with a search that matches nothing, not ready and failed; the
 * form empty, filled (Edit, with four stored photos), not ready, its photo tiles (preparing, refused twice, not sent),
 * the unsent footer, and the location refused; a visit with four photos and its other visits, one with only two
 * ratings, the same with the Delete confirm open, not ready, and gone. The fakes save nothing: Save
 * answers ok after a moment and says so in a line, a picked photo is resized by the browser's own encoder and its
 * "upload" answers ok without sending anything, Delete answers ok, and the views never change. `state` (the page's
 * ?state=) draws one state alone; none draws them all.
 */
import { useState } from "react";
import { PLACES_NOT_READY, blankDraft, draftOfVisit, type VisitPhoto } from "@/lib/places";
import { LOCATION_OFF, PlaceForm } from "@/components/places/PlaceForm";
import { PlacesList } from "@/components/places/PlacesList";
import { VisitDetail } from "@/components/places/VisitDetail";
import type { DeleteVisit, UploadPhoto, VisitFormActions } from "@/components/places/types";
import {
  DETAIL_FIXTURES,
  FISH_BAR,
  LIST_FIXTURES,
  LUMEN_LATEST,
  NO_MATCH_QUERY,
  PHOTO_STATE_PICKS,
  PLACES_FIXTURE_NOW,
  PLACES_FIXTURE_STATES,
  UNSENT_PICKS,
  fixturePhotos,
  type PlacesFixtureState,
} from "@/components/places/fixtures";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FAKE_ACTIONS: VisitFormActions = {
  saveVisit: async () => {
    await wait(300);
    return { ok: true, value: { id: "fx-saved", replay: false, photoCount: 0 } };
  },
  updateVisit: async (id, _input, remove) => {
    await wait(300);
    const stored = id === LUMEN_LATEST.id ? fixturePhotos(LUMEN_LATEST.id, 4) : [];
    return { ok: true, value: { id, replay: false, photoCount: stored.filter((p) => !remove.includes(p.full.id)).length } };
  },
};

const FAKE_UPLOAD: UploadPhoto = async (visitId, ord, photo) => {
  await wait(200);
  const shown: VisitPhoto = {
    ord,
    full: { id: `${visitId}-new-${ord}`, src: "", width: photo.full.width, height: photo.full.height },
    thumb: { id: `${visitId}-newt-${ord}`, src: "", width: photo.thumb.width, height: photo.thumb.height },
  };
  return { ok: true, value: shown };
};

const FAKE_DELETE: DeleteVisit = async () => {
  await wait(300);
  return { ok: true, value: { deleted: 1 } };
};

const TITLES: Record<PlacesFixtureState, string> = {
  "list-empty": "Visits · empty",
  "list-grouped": "Visits · a place visited three times, grouped",
  "list-group-open": "Visits · the grouped place opened",
  "list-no-match": "Visits · a search that matches nothing",
  "list-not-ready": "Visits · not ready",
  "list-failed": "Visits · the read failed",
  "form-empty": "Check in · empty",
  "form-filled": "Edit · filled, four stored photos",
  "form-not-ready": "Check in · not ready",
  "form-photo-states": "Check in · photos preparing, refused and not sent",
  "form-unsent": "Check in · saved, a photo not sent",
  "form-location-off": "Check in · location refused",
  "visit-four-photos": "A visit · four photos, other visits",
  "visit-two-ratings": "A visit · two ratings",
  "visit-delete-armed": "A visit · the Delete confirm open",
  "visit-not-ready": "A visit · not ready",
  "visit-gone": "A visit · gone",
};

function Done({ line }: { line: string | null }) {
  return line ? (
    <p className="t-meta pl-note" role="status">
      {line}
    </p>
  ) : null;
}

type FormState = "form-empty" | "form-filled" | "form-not-ready" | "form-photo-states" | "form-unsent" | "form-location-off";

function FormFixture({ state }: { state: FormState }) {
  const [line, setLine] = useState<string | null>(null);
  const filled = state === "form-filled";
  const draft = filled ? draftOfVisit(LUMEN_LATEST, fixturePhotos(LUMEN_LATEST.id, 4)) : state === "form-unsent" ? draftOfVisit(FISH_BAR, []) : blankDraft(PLACES_FIXTURE_NOW);
  return (
    <>
      <PlaceForm
        mode={filled ? "edit" : "new"}
        visitId={filled ? LUMEN_LATEST.id : undefined}
        draft={draft}
        actions={FAKE_ACTIONS}
        knownPlaces={["Café Lumen", "Harbour Fish Bar", "Northside Pool"]}
        notice={state === "form-not-ready" ? PLACES_NOT_READY : null}
        onDone={(id) => setLine(`Saved ${id}. A fixture keeps nothing.`)}
        cancelHref="/dev/style/places"
        upload={FAKE_UPLOAD}
        initialPhotos={state === "form-photo-states" ? PHOTO_STATE_PICKS : state === "form-unsent" ? UNSENT_PICKS : undefined}
        initialPhase={state === "form-unsent" ? "unsent" : "edit"}
        initialSavedId={state === "form-unsent" ? "fx-saved" : null}
        initialLocLine={state === "form-location-off" ? LOCATION_OFF : null}
      />
      <Done line={line} />
    </>
  );
}

function DetailFixture({ state }: { state: keyof typeof DETAIL_FIXTURES }) {
  const [line, setLine] = useState<string | null>(null);
  return (
    <>
      <VisitDetail detail={DETAIL_FIXTURES[state]} deleteVisit={FAKE_DELETE} onDeleted={() => setLine("Deleted. A fixture keeps everything.")} initiallyArmed={state === "visit-delete-armed"} />
      <Done line={line} />
    </>
  );
}

function One({ state }: { state: PlacesFixtureState }) {
  switch (state) {
    case "list-empty":
    case "list-grouped":
    case "list-group-open":
    case "list-no-match":
    case "list-not-ready":
    case "list-failed":
      return <PlacesList view={LIST_FIXTURES[state]} initiallyOpen={state === "list-group-open"} initialQuery={state === "list-no-match" ? NO_MATCH_QUERY : ""} />;
    case "form-empty":
    case "form-filled":
    case "form-not-ready":
    case "form-photo-states":
    case "form-unsent":
    case "form-location-off":
      return <FormFixture state={state} />;
    default:
      return <DetailFixture state={state} />;
  }
}

export function PlacesFixtures({ state }: { state: PlacesFixtureState | null }) {
  const shown = state ? [state] : PLACES_FIXTURE_STATES;
  return (
    <div className="page narrow">
      <div className="pl-fx">
        {shown.map((s) => (
          <section key={s} className="pl-fx-state" data-state={s} aria-label={TITLES[s]}>
            <p className="t-eyebrow pl-note">{TITLES[s]}</p>
            <One state={s} />
          </section>
        ))}
      </div>
    </div>
  );
}
