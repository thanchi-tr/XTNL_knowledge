"use client";

/**
 * The form's photos: up to PHOTOS_MAX, each resized and re-encoded in the browser the moment it is picked
 * (photo-encode.ts: so the preview is what will be sent, and the picked file itself never is), with its preview and
 * a 44 px Remove. Two ways to add: "Take a photo" (the camera: capture="environment") and "Choose photos" (the
 * gallery, several at once); both are image/* file inputs, visually hidden under a 44 px label, so the keyboard
 * reaches them and their focus ring shows on the label.
 *
 *   usePickedPhotos(stored, encode, initial?)   the list: a visit's stored photos (Edit) and the new ones, with add,
 *                                     remove and patch (the form marks each upload); previews are object URLs,
 *                                     revoked on Remove and when the form goes. `initial` is a fixture's list (a
 *                                     tile preparing, refused or not sent); the pages never pass it
 *   <PhotoPicker items onAdd onRemove disabled note/>
 */
import { useEffect, useId, useRef, useState } from "react";
import { PHOTOS_MAX, PHOTO_NOT_IMAGE, type PhotoImage, type VisitPhoto } from "@/lib/places";
import { Icon } from "@/components/ui/Icon";
import { Photo } from "./Photo";
import type { EncodePhoto, EncodedPhoto } from "./types";

/** A photo the visit already keeps (Edit), named by its full image's id (an edit's places change; its id never does). */
export interface StoredPick {
  kind: "stored";
  key: string;
  ord: number;
  fullId: string;
  image: PhotoImage;
}

/** A photo picked in this form: encoding, ready to send, sending, sent, or refused (its line says why). */
export interface NewPick {
  kind: "new";
  key: string;
  status: "encoding" | "ready" | "failed" | "uploading" | "uploaded" | "unsent";
  preview: string | null;
  width: number;
  height: number;
  photo: EncodedPhoto | null;
  error: string | null;
  /** The place it goes to, fixed at its first send, so a retry replaces rather than adds. */
  ord: number | null;
}

export type PickedPhoto = StoredPick | NewPick;

export function storedPicksOf(photos: readonly VisitPhoto[]): StoredPick[] {
  return [...photos].sort((a, b) => a.ord - b.ord).map((p) => ({ kind: "stored", key: `s${p.ord}:${p.full.id}`, ord: p.ord, fullId: p.full.id, image: p.thumb ?? p.full }));
}

/** 'Up to 4 photos. 2 weren't added.' when a pick holds more than there is room for. */
export function overflowLineOf(skipped: number): string | null {
  if (skipped <= 0) return null;
  return `Up to ${PHOTOS_MAX} photos. ${skipped === 1 ? "1 wasn't" : `${skipped} weren't`} added.`;
}

export function usePickedPhotos(stored: readonly VisitPhoto[], encode: EncodePhoto, initial?: readonly PickedPhoto[]) {
  const [items, setItems] = useState<PickedPhoto[]>(() => (initial ? [...initial] : storedPicksOf(stored)));
  const [note, setNote] = useState<string | null>(null);
  const urls = useRef<Set<string>>(new Set());
  const seq = useRef(0);

  useEffect(() => {
    const made = urls.current;
    return () => {
      for (const u of made) URL.revokeObjectURL(u);
      made.clear();
    };
  }, []);

  function patch(key: string, next: Partial<NewPick>) {
    setItems((cur) => cur.map((it) => (it.key === key && it.kind === "new" ? { ...it, ...next } : it)));
  }

  async function add(files: readonly File[]) {
    const room = Math.max(0, PHOTOS_MAX - items.length);
    const taken = files.slice(0, room).map((file) => {
      seq.current += 1;
      return { key: `n${seq.current}`, file };
    });
    setNote(overflowLineOf(files.length - taken.length));
    if (taken.length === 0) return;
    setItems((cur) => [...cur, ...taken.map((t): NewPick => ({ kind: "new", key: t.key, status: "encoding", preview: null, width: 1, height: 1, photo: null, error: null, ord: null }))]);
    for (const t of taken) {
      let res: Awaited<ReturnType<EncodePhoto>>;
      try {
        res = await encode(t.file);
      } catch {
        res = { ok: false, error: PHOTO_NOT_IMAGE };
      }
      if (res.ok) {
        const preview = URL.createObjectURL(res.value.thumb.blob);
        urls.current.add(preview);
        patch(t.key, { status: "ready", preview, width: res.value.thumb.width, height: res.value.thumb.height, photo: res.value });
      } else {
        patch(t.key, { status: "failed", error: res.error });
      }
    }
  }

  function remove(key: string) {
    const it = items.find((x) => x.key === key);
    if (it && it.kind === "new" && it.preview) {
      URL.revokeObjectURL(it.preview);
      urls.current.delete(it.preview);
    }
    setItems((cur) => cur.filter((x) => x.key !== key));
    setNote(null);
  }

  return { items, note, add, remove, patch };
}

const TILE_NOTE: Partial<Record<NewPick["status"], string>> = { encoding: "Preparing…", uploading: "Sending…", unsent: "Not sent yet" };

export function PhotoPicker({
  items,
  onAdd,
  onRemove,
  disabled = false,
  note,
}: {
  items: readonly PickedPhoto[];
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  disabled?: boolean;
  note?: string | null;
}) {
  const id = useId();
  const full = items.length >= PHOTOS_MAX;
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (files.length > 0) onAdd(files);
  };
  const failed = items.filter((it): it is NewPick => it.kind === "new" && it.status === "failed");
  return (
    <div className="pl-field" role="group" aria-labelledby={`${id}-h`}>
      <p id={`${id}-h`} className="pl-label">
        Photos <span className="pl-opt">(up to {PHOTOS_MAX})</span>
      </p>
      {items.length > 0 && (
        <ul className="pl-photos" data-photos={items.length}>
          {items.map((it, i) => {
            const n = i + 1;
            const src = it.kind === "stored" ? it.image.src : it.preview;
            const w = it.kind === "stored" ? it.image.width : it.width;
            const h = it.kind === "stored" ? it.image.height : it.height;
            const line = it.kind === "new" ? (it.status === "failed" ? it.error : TILE_NOTE[it.status] ?? null) : null;
            return (
              <li key={it.key} className="pl-tile">
                {src && <Photo src={src} width={w} height={h} alt={`Photo ${n}`} />}
                {line && <span className="pl-tile-note">{line}</span>}
                <button type="button" className="pl-remove" aria-label={`Remove photo ${n}`} onClick={() => onRemove(it.key)} disabled={disabled}>
                  <Icon name="x" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="pl-adds">
        <label className="pl-add">
          <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={pick} disabled={disabled || full} />
          <Icon name="plus" />
          Take a photo
        </label>
        <label className="pl-add">
          <input type="file" accept="image/*" multiple className="sr-only" onChange={pick} disabled={disabled || full} />
          <Icon name="grid" />
          Choose photos
        </label>
      </div>
      {full && <p className="t-meta pl-note">That&apos;s {PHOTOS_MAX} photos, the most a visit keeps.</p>}
      {note && (
        <p className="t-meta pl-note" role="status">
          {note}
        </p>
      )}
      {failed.length > 0 && (
        <p className="t-error" role="alert">
          {failed.length === 1 ? "A photo couldn't be prepared. Remove it or pick another." : `${failed.length} photos couldn't be prepared. Remove them or pick others.`}
        </p>
      )}
    </div>
  );
}
