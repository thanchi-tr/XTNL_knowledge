"use client";

/**
 * Places › Check in, and a visit's Edit: the place (required), an optional address, an optional location (only when
 * "Use my location" is tapped: the browser asks, and nothing is read before the tap or after it), when (now by
 * default, a date and a time to change), the four ratings (each 1 to 5 stars or Not rated, the overall their mean),
 * up to four photos, and a short summary. A record, never a reward: Save keeps it and says nothing about points.
 *
 * Save sends the fields first (actions.saveVisit, or updateVisit with the stored photos removed, named by their full
 * image's id so a retry after a lost answer removes nothing more), then each new photo in turn to its own place
 * (upload), so a lost photo never costs the visit. One clientId per check-in, made at the
 * first Save and sent again on a retry, so a resend saves it once. When a photo doesn't send, the form says how many,
 * keeps the visit, and offers to send them again (each to the place it was given, so a retry replaces, never adds) or
 * to go on without them. `onDone(id)` is the page's navigation (PlaceFormRoute) or a fixture's line.
 *
 * Only the Save button saves (a type="button" with its own click): the form's submit is always cancelled, so the
 * keyboard's Enter, Next or Go in a one-line field never saves a half-filled check-in. Enter in Place moves to
 * Address and in Address to When (their enterKeyHint is "next").
 *
 * `actions` are the server actions (page) or fakes (fixtures); `encode` and `upload` default to the browser's own
 * (photo-encode.ts, upload.ts) and a fixture passes fakes. The initial* props are a fixture's (a tile preparing or
 * refused, the unsent footer, the location refused); the pages never pass them. Nothing here imports a server module,
 * and nothing here touches a URL.
 */
import { useId, useRef, useState } from "react";
import {
  ACCURACY_MAX,
  ADDRESS_MAX,
  NAME_MAX,
  NAME_NEEDED,
  RATING_KEYS,
  RATING_LABELS,
  SUMMARY_MAX,
  locationLineOf,
  overallOf,
  stripInvisible,
  type PlaceDraft,
  type PlaceLocation,
  type RatingKey,
  type Ratings,
} from "@/lib/places";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PhotoPicker, usePickedPhotos, type NewPick, type PickedPhoto } from "./PhotoPicker";
import { StarInput } from "./StarInput";
import { Stars } from "./Stars";
import { encodePhoto } from "./photo-encode";
import { uploadPhoto } from "./upload";
import type { EncodePhoto, SaveVisitInput, UploadPhoto, VisitFormActions } from "./types";

export const LOCATING = "Finding where you are…";
export const LOCATION_OFF = "Location is off for this site. Allow it in the browser to add one.";
export const LOCATION_FAILED = "Couldn't get a location. Try again.";
export const LOCATION_NONE = "This browser can't share a location.";
const UNREACHABLE = "Couldn't reach the server. Try again.";

/** A UUID v4: crypto.randomUUID on a secure context, else the same shape from getRandomValues (plain http on a LAN). */
export function newClientId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** '2 photos didn't send.' */
export function unsentLineOf(n: number): string {
  return n === 1 ? "1 photo didn't send. The visit is saved." : `${n} photos didn't send. The visit is saved.`;
}

export type FormPhase = "edit" | "saving" | "sending" | "unsent";

/** Enter in a one-line field moves on to the field `nextId` names (never a submit; an IME's Enter is its own). */
function enterMovesTo(nextId: string) {
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    document.getElementById(nextId)?.focus();
  };
}

export function PlaceForm({
  mode,
  visitId,
  draft,
  actions,
  knownPlaces = [],
  notice = null,
  onDone,
  cancelHref,
  encode = encodePhoto,
  upload = uploadPhoto,
  initialPhotos,
  initialPhase = "edit",
  initialSavedId = null,
  initialLocLine = null,
}: {
  mode: "new" | "edit";
  /** Edit: the visit. */
  visitId?: string;
  draft: PlaceDraft;
  actions: VisitFormActions;
  /** The user's places, newest first, offered as the name is typed. */
  knownPlaces?: readonly string[];
  /** One plain line over the form (the tables not ready). */
  notice?: string | null;
  onDone: (id: string) => void;
  cancelHref: string;
  encode?: EncodePhoto;
  upload?: UploadPhoto;
  /** A fixture's photo tiles in place of the draft's (preparing, refused, not sent). */
  initialPhotos?: readonly PickedPhoto[];
  /** A fixture's starting phase and saved visit (the unsent footer). */
  initialPhase?: FormPhase;
  initialSavedId?: string | null;
  /** A fixture's location line (the browser refused). */
  initialLocLine?: string | null;
}) {
  const id = useId();
  const [placeName, setPlaceName] = useState(draft.placeName);
  const [address, setAddress] = useState(draft.address);
  const [location, setLocation] = useState<PlaceLocation | null>(draft.location);
  const [locLine, setLocLine] = useState<string | null>(initialLocLine);
  const [visitedLocal, setVisitedLocal] = useState(draft.visitedLocal);
  const [ratings, setRatings] = useState<Ratings>({ ...draft.ratings });
  const [summary, setSummary] = useState(draft.summary);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormPhase>(initialPhase);
  const [savedId, setSavedId] = useState<string | null>(initialSavedId);
  const photos = usePickedPhotos(draft.photos, encode, initialPhotos);
  const clientId = useRef<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const locked = phase !== "edit";
  const overall = overallOf(ratings);

  /** "Use my location": the one place the browser is asked, and only on this tap. */
  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocLine(LOCATION_NONE);
      return;
    }
    setLocLine(LOCATING);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const acc = Number.isFinite(pos.coords.accuracy) ? Math.min(ACCURACY_MAX, Math.round(pos.coords.accuracy)) : null;
        setLocation({ lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6, accuracyM: acc });
        setLocLine(null);
      },
      (err) => setLocLine(err.code === 1 ? LOCATION_OFF : LOCATION_FAILED),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
    );
  }

  function setRating(k: RatingKey, v: number | null) {
    setRatings((cur) => ({ ...cur, [k]: v }));
  }

  /** Sends each new photo not sent yet, in order, each to its own place; answers how many didn't send. */
  async function send(visit: string, base: number): Promise<number> {
    const pending = photos.items.filter((it): it is NewPick => it.kind === "new" && (it.status === "ready" || it.status === "unsent") && it.photo !== null);
    const used = new Set(photos.items.filter((it): it is NewPick => it.kind === "new" && it.ord !== null).map((it) => it.ord as number));
    let next = base;
    let unsent = 0;
    for (const it of pending) {
      let ord = it.ord;
      if (ord === null) {
        while (used.has(next)) next++;
        ord = next;
        used.add(ord);
        next++;
      }
      photos.patch(it.key, { status: "uploading", ord });
      let res: Awaited<ReturnType<UploadPhoto>>;
      try {
        res = await upload(visit, ord, it.photo as NonNullable<NewPick["photo"]>);
      } catch {
        res = { ok: false, error: UNREACHABLE };
      }
      if (res.ok) photos.patch(it.key, { status: "uploaded", error: null });
      else {
        unsent++;
        photos.patch(it.key, { status: "unsent", error: res.error });
      }
    }
    return unsent;
  }

  /** The Save button's click: the one way a check-in is saved. */
  async function save() {
    if (locked) return;
    if (!stripInvisible(placeName).trim()) {
      setError(NAME_NEEDED);
      nameRef.current?.focus();
      return;
    }
    if (photos.items.some((it) => it.kind === "new" && it.status === "encoding")) {
      setError("A photo is still being prepared. Save again in a moment.");
      return;
    }
    setError(null);
    setPhase("saving");
    clientId.current ??= newClientId();
    const input: SaveVisitInput = { placeName, address, location, visitedLocal, ratings, summary, clientId: clientId.current };
    // The stored photos removed in this form, by their full image's id: a retry sends the same ids, which the server
    // no longer holds, so it removes nothing more; a photo this page never drew is never named.
    const kept = new Set(photos.items.flatMap((it) => (it.kind === "stored" ? [it.fullId] : [])));
    const remove = draft.photos.filter((p) => !kept.has(p.full.id)).map((p) => p.full.id);
    let res: Awaited<ReturnType<VisitFormActions["saveVisit"]>>;
    try {
      res = mode === "edit" && visitId ? await actions.updateVisit(visitId, input, remove) : await actions.saveVisit(input);
    } catch {
      res = { ok: false, error: UNREACHABLE };
    }
    if (!res.ok) {
      setError(res.error);
      setPhase("edit");
      return;
    }
    const saved = res.value.id;
    setSavedId(saved);
    setPhase("sending");
    const unsent = await send(saved, res.value.photoCount);
    if (unsent > 0) {
      setPhase("unsent");
      return;
    }
    onDone(saved);
  }

  async function retry() {
    if (!savedId) return;
    setPhase("sending");
    const unsent = await send(savedId, 0);
    if (unsent > 0) setPhase("unsent");
    else onDone(savedId);
  }

  const unsentCount = photos.items.filter((it) => it.kind === "new" && it.status === "unsent").length;
  const sendingCount = photos.items.filter((it) => it.kind === "new" && (it.status === "uploading" || it.status === "uploaded")).length;
  const toSend = photos.items.filter((it) => it.kind === "new" && it.status !== "failed").length;

  return (
    <form className="pl-form" onSubmit={(e) => e.preventDefault()} noValidate data-form={mode}>
      {notice && <p className="t-meta pl-note">{notice}</p>}

      <section className="card pl-sec" aria-labelledby={`${id}-where`}>
        <h2 id={`${id}-where`} className="pl-sec-h">
          Where
        </h2>
        <div className="pl-field">
          <label className="pl-label" htmlFor={`${id}-name`}>
            Place
          </label>
          <input
            ref={nameRef}
            id={`${id}-name`}
            className="pl-input"
            name="placeName"
            value={placeName}
            onChange={(e) => setPlaceName(e.target.value)}
            maxLength={NAME_MAX}
            required
            autoComplete="off"
            enterKeyHint="next"
            onKeyDown={enterMovesTo(`${id}-address`)}
            list={knownPlaces.length > 0 ? `${id}-known` : undefined}
            disabled={locked}
            aria-invalid={error === NAME_NEEDED ? true : undefined}
          />
          {knownPlaces.length > 0 && (
            <datalist id={`${id}-known`}>
              {knownPlaces.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          )}
        </div>
        <div className="pl-field">
          <label className="pl-label" htmlFor={`${id}-address`}>
            Address <span className="pl-opt">(optional)</span>
          </label>
          <input
            id={`${id}-address`}
            className="pl-input"
            name="placeAddress"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={ADDRESS_MAX}
            autoComplete="off"
            enterKeyHint="next"
            onKeyDown={enterMovesTo(`${id}-at`)}
            disabled={locked}
          />
        </div>
        <div className="pl-loc">
          {location ? (
            <>
              <p className="pl-loc-line">
                <Icon name="pin" size={16} />
                <span>{locationLineOf(location)}</span>
              </p>
              <Button variant="quiet" onClick={() => setLocation(null)} disabled={locked}>
                Remove location
              </Button>
            </>
          ) : (
            <Button variant="secondary" icon="pin" onClick={locate} disabled={locked || locLine === LOCATING}>
              Use my location
            </Button>
          )}
          {locLine && (
            <p className="t-meta pl-note" role="status">
              {locLine}
            </p>
          )}
        </div>
      </section>

      <section className="card pl-sec" aria-labelledby={`${id}-when`}>
        <h2 id={`${id}-when`} className="pl-sec-h">
          <label htmlFor={`${id}-at`}>When</label>
        </h2>
        <input id={`${id}-at`} className="pl-input" type="datetime-local" name="visitedLocal" value={visitedLocal} onChange={(e) => setVisitedLocal(e.target.value)} required disabled={locked} />
      </section>

      <section className="card pl-sec" aria-labelledby={`${id}-rate`}>
        <h2 id={`${id}-rate`} className="pl-sec-h">
          Ratings
        </h2>
        <div className="pl-rates">
          {RATING_KEYS.map((k) => (
            <StarInput key={k} name={k} label={RATING_LABELS[k]} value={ratings[k]} onChange={(v) => setRating(k, v)} disabled={locked} />
          ))}
        </div>
        <p className="pl-overall" aria-live="polite">
          Overall <Stars score={overall} />
        </p>
      </section>

      <section className="card pl-sec" aria-label="Photos">
        <PhotoPicker items={photos.items} onAdd={(files) => void photos.add(files)} onRemove={photos.remove} disabled={locked} note={photos.note} />
      </section>

      <section className="card pl-sec" aria-labelledby={`${id}-sum`}>
        <h2 className="pl-sec-h" id={`${id}-sum`}>
          <label htmlFor={`${id}-summary`}>
            Summary <span className="pl-opt">(optional)</span>
          </label>
        </h2>
        <textarea id={`${id}-summary`} className="pl-input" name="summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={SUMMARY_MAX} rows={4} disabled={locked} aria-describedby={`${id}-count`} />
        <p id={`${id}-count`} className="pl-count">
          {summary.length}/{SUMMARY_MAX}
        </p>
      </section>

      {error && (
        <p className="t-error" role="alert">
          {error}
        </p>
      )}
      {phase === "sending" && (
        <p className="t-meta pl-note" role="status">
          Sending photos… {Math.min(sendingCount, toSend)} of {toSend}
        </p>
      )}
      {phase === "unsent" && savedId ? (
        <div className="pl-foot" role="group" aria-label="Photos not sent">
          <p className="t-error" role="alert" style={{ flexBasis: "100%" }}>
            {unsentLineOf(unsentCount)}
          </p>
          <Button variant="primary" size="lg" onClick={() => void retry()}>
            Send them again
          </Button>
          <Button variant="quiet" size="lg" onClick={() => onDone(savedId)}>
            Go on without them
          </Button>
        </div>
      ) : (
        <div className="pl-foot">
          <Button type="button" variant="primary" size="lg" onClick={() => void save()} disabled={locked}>
            {phase === "saving" ? "Saving…" : phase === "sending" ? "Sending photos…" : mode === "edit" ? "Save changes" : "Save check-in"}
          </Button>
          <Button variant="quiet" size="lg" href={cancelHref}>
            Cancel
          </Button>
        </div>
      )}
    </form>
  );
}
