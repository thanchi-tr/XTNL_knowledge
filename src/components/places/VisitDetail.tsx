"use client";

/**
 * One visit (/places/<id>): its photos large (the full images, the first loaded at once, the rest as they scroll in),
 * the four ratings (Not rated said in words) and the overall, the summary, where (the address, and the location when
 * one was added, with a geo: link for a maps app), Edit, Delete behind a confirm (the visit and its photos go
 * together; it can't be undone), and the other visits to the same place with their count and average.
 *
 * States: not ready (the tables aren't on this database yet), the read failed, and a visit that isn't here, each one
 * plain line with the way back to Visits. `deleteVisit` is the server action (page) or a fake (fixtures); onDeleted is
 * the page's navigation (PlacesRoutes) or a fixture's line; `initiallyArmed` is a fixture's (the Delete confirm open).
 */
import { Fragment, useEffect, useId, useRef, useState, useTransition } from "react";
import {
  PLACES_LOAD_FAILED,
  PLACES_NOT_READY,
  PLACES_PATH,
  RATING_KEYS,
  RATING_LABELS,
  VISIT_GONE,
  averageOf,
  editHref,
  geoHrefOf,
  locationLineOf,
  visitsInAllLineOf,
  whenLineOf,
  type VisitDetail as VisitDetailView,
} from "@/lib/places";
import { Button } from "@/components/ui/Button";
import { Photo } from "./Photo";
import { Stars } from "./Stars";
import { VisitCard } from "./VisitCard";
import type { DeleteVisit } from "./types";

export const DELETE_CONFIRM = "Delete this visit and its photos? It can't be undone.";
const UNREACHABLE = "Couldn't reach the server. Try again.";

function Back() {
  return (
    <Button variant="secondary" href={PLACES_PATH} icon="back">
      All visits
    </Button>
  );
}

export function VisitDetail({ detail, deleteVisit, onDeleted, initiallyArmed = false }: { detail: VisitDetailView; deleteVisit: DeleteVisit; onDeleted: () => void; initiallyArmed?: boolean }) {
  const { visit } = detail;
  if (!detail.ready || !visit) {
    const line = !detail.ready ? (detail.failed ? PLACES_LOAD_FAILED : PLACES_NOT_READY) : VISIT_GONE;
    return (
      <div className="pl-page" data-state={!detail.ready ? (detail.failed ? "failed" : "not-ready") : "gone"}>
        <p className="t-body pl-note">{line}</p>
        <div className="pl-acts">
          <Back />
        </div>
      </div>
    );
  }
  const name = visit.placeName;
  const all = [visit, ...detail.others];
  return (
    <article className="pl-page" data-visit={visit.id}>
      <header className="pl-body">
        <h1 className="t-display-m pl-note pl-title">{name}</h1>
        <p className="t-meta pl-note">{whenLineOf(visit.visitedAt)}</p>
      </header>

      {detail.photos.length > 0 && (
        <ul className="pl-hero" aria-label={`Photos of ${name}`}>
          {detail.photos.map((p, i) => (
            <li key={p.full.id}>
              <Photo className="pl-full" src={p.full.src} width={p.full.width} height={p.full.height} alt={`Photo ${i + 1} of ${detail.photos.length}`} eager={i === 0} />
            </li>
          ))}
        </ul>
      )}

      <section className="card pad-l" aria-labelledby={`r-${visit.id}`}>
        <h2 id={`r-${visit.id}`} className="pl-sec-h">
          Ratings
        </h2>
        <dl className="pl-ratings">
          {RATING_KEYS.map((k) => (
            <Fragment key={k}>
              <dt>{RATING_LABELS[k]}</dt>
              <dd>
                <Stars score={visit.ratings[k]} whole />
              </dd>
            </Fragment>
          ))}
          <dt>Overall</dt>
          <dd>
            <Stars score={visit.overall} />
          </dd>
        </dl>
      </section>

      {visit.summary && (
        <section className="card pad-l" aria-label="Summary">
          <p className="t-body pl-summary">{visit.summary}</p>
        </section>
      )}

      {(visit.address || visit.location) && (
        <section className="card pad-l pl-body" aria-label="Where">
          {visit.address && <p className="t-body pl-note">{visit.address}</p>}
          {visit.location && (
            <>
              <p className="t-meta pl-note">{locationLineOf(visit.location)}</p>
              <a className="pl-geo" href={geoHrefOf(visit.location)}>
                Open in a maps app
              </a>
            </>
          )}
        </section>
      )}

      <DeleteBar id={visit.id} deleteVisit={deleteVisit} onDeleted={onDeleted} initiallyArmed={initiallyArmed} />

      {detail.others.length > 0 && (
        <section className="pl-body" aria-labelledby={`o-${visit.id}`} style={{ gap: 10 }}>
          <h2 id={`o-${visit.id}`} className="pl-sec-h">
            Other visits to {name}
          </h2>
          <p className="t-meta pl-note">{visitsInAllLineOf(all.length, averageOf(all))}</p>
          <ul className="pl-list">
            {detail.others.map((o) => (
              <li key={o.id}>
                <VisitCard visit={o} today={detail.today} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

/** Edit, and Delete behind its confirm (focus follows the swap, never on the first render). */
function DeleteBar({ id, deleteVisit, onDeleted, initiallyArmed = false }: { id: string; deleteVisit: DeleteVisit; onDeleted: () => void; initiallyArmed?: boolean }) {
  const qid = useId();
  const [armed, setArmed] = useState(initiallyArmed);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current) return;
    boxRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled), a")?.focus();
  }, [armed]);

  function arm(on: boolean) {
    moved.current = true;
    setError(null);
    setArmed(on);
  }

  function run() {
    startTransition(async () => {
      try {
        const res = await deleteVisit(id);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setGone(true);
        onDeleted();
      } catch {
        setError(UNREACHABLE);
      }
    });
  }

  return (
    <div ref={boxRef} className="pl-confirm">
      {gone ? (
        <p className="t-meta pl-note" role="status">
          Deleted.
        </p>
      ) : armed ? (
        <div className="pl-confirm" role="group" aria-labelledby={qid}>
          <p id={qid} className="t-body pl-note">
            {DELETE_CONFIRM}
          </p>
          <div className="pl-acts">
            <Button variant="danger" onClick={run} disabled={pending}>
              {pending ? "Deleting…" : "Delete visit"}
            </Button>
            <Button variant="quiet" onClick={() => arm(false)} disabled={pending}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div className="pl-acts">
          <Button variant="secondary" href={editHref(id)}>
            Edit
          </Button>
          <Button variant="quiet" onClick={() => arm(true)}>
            Delete
          </Button>
        </div>
      )}
      {error && (
        <p className="t-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
