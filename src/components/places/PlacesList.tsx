"use client";

/**
 * Places › Visits (/places): Check in, a search box, and every visit newest first (places.ts placesListOf). A place
 * visited once is its card (its thumbnail, the place, its stars, the day, the summary's first line); a place visited
 * more than once is one card for its newest visit with the count and the average, and "Show the n visits" opens each
 * one's row. The search folds case, spacing and accents and keeps the places with any visit whose name, address or
 * summary hold every word (places.ts searchListOf); a place's count and average are always all of its visits. It
 * filters what is already on the page: nothing is sent and nothing goes in the URL.
 *
 * States: not ready (the tables aren't on this database yet), the read failed (never drawn as an empty list), empty,
 * and no match. `initialQuery` and `initiallyOpen` are a fixture's (no match, a group opened); the page passes neither.
 */
import { useDeferredValue, useId, useMemo, useState } from "react";
import type { DayKey } from "@/lib/life-day";
import {
  PLACES_EMPTY,
  PLACES_LOAD_FAILED,
  PLACES_NEW_PATH,
  PLACES_NOT_READY,
  dayWordsOf,
  firstLineOf,
  lastVisitLineOf,
  searchListOf,
  visitHref,
  visitsLineOf,
  type ListEntry,
  type PlacesView,
} from "@/lib/places";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Stars } from "./Stars";
import { Thumb, VisitCard } from "./VisitCard";

export const NO_MATCH = "No visits match that.";

function PlaceGroup({ entry, today, initiallyOpen = false }: { entry: Extract<ListEntry, { kind: "place" }>; today: DayKey; initiallyOpen?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(initiallyOpen);
  const latest = entry.latest;
  const line = firstLineOf(latest.summary);
  return (
    <div className="card pl-group" data-place={entry.placeKey}>
      <Link href={visitHref(latest.id)} className="pl-card" data-visit={latest.id}>
        <Thumb visit={latest} />
        <span className="pl-body">
          <span className="pl-name">{entry.placeName}</span>
          <span className="pl-meta">
            <Stars score={entry.average} bare label="Average" />
            <span>{visitsLineOf(entry.count, entry.average)}</span>
            <span>{lastVisitLineOf(latest.day, today)}</span>
          </span>
          {line && <span className="pl-line">{line}</span>}
        </span>
      </Link>
      <button type="button" className="pl-toggle" aria-expanded={open} aria-controls={`${id}-v`} onClick={() => setOpen((o) => !o)}>
        <span>{open ? `Hide the ${entry.count} visits` : `Show the ${entry.count} visits`}</span>
        <Icon name="chev" />
      </button>
      {open && (
        <ul id={`${id}-v`} className="pl-visits">
          {entry.visits.map((v) => {
            const l = firstLineOf(v.summary);
            return (
              <li key={v.id}>
                <Link href={visitHref(v.id)} className="pl-row" data-visit={v.id}>
                  <span className="pl-meta">
                    <span className="pl-score">{dayWordsOf(v.day, today)}</span>
                    <Stars score={v.overall} />
                  </span>
                  {l && <span className="pl-line">{l}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PlacesList({ view, initialQuery = "", initiallyOpen = false }: { view: PlacesView; initialQuery?: string; initiallyOpen?: boolean }) {
  const id = useId();
  const [query, setQuery] = useState(initialQuery);
  const deferred = useDeferredValue(query);
  const entries = useMemo(() => searchListOf(view.visits, deferred), [view.visits, deferred]);

  const head = (
    <div className="pl-head">
      <h1 className="t-display-m">Visits</h1>
      <Button variant="primary" href={PLACES_NEW_PATH} icon="plus">
        Check in
      </Button>
    </div>
  );

  if (!view.ready) {
    return (
      <div className="pl-page" data-state={view.failed ? "failed" : "not-ready"}>
        {head}
        <p className="t-body pl-note">{view.failed ? PLACES_LOAD_FAILED : PLACES_NOT_READY}</p>
      </div>
    );
  }
  if (view.visits.length === 0) {
    return (
      <div className="pl-page" data-state="empty">
        {head}
        <p className="t-body pl-note">{PLACES_EMPTY}</p>
      </div>
    );
  }
  return (
    <div className="pl-page" data-state="list">
      {head}
      <div className="pl-search" role="search">
        <label className="sr-only" htmlFor={`${id}-q`}>
          Search visits
        </label>
        <Icon name="search" />
        <input id={`${id}-q`} className="pl-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search places" autoComplete="off" enterKeyHint="search" />
      </div>
      {entries.length === 0 ? (
        <p className="t-body pl-note" role="status">
          {NO_MATCH}
        </p>
      ) : (
        <ul className="pl-list" aria-label="Visits, newest first">
          {entries.map((e) => (
            <li key={e.key}>{e.kind === "visit" ? <VisitCard visit={e.visit} today={view.today} /> : <PlaceGroup entry={e} today={view.today} initiallyOpen={initiallyOpen} />}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
