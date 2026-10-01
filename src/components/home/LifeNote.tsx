"use client";

/**
 * The note that life now counts toward the character. The You sheet renders
 * it above Life tracks in the 14 days after launch (loadSheet's lifeNote),
 * so the day the levels move is explained where they move. 'Got it' hides
 * it for good on this device.
 *
 * Storage is a convenience, never a requirement: every read and write is
 * guarded, and a storage that is missing or throws (a private window,
 * blocked site data, a thumbnail capture) reads as "not dismissed", so the
 * note renders. It shows after hydration only: the server cannot know a
 * dismissal, so it renders nothing rather than flash a note it then hides.
 */
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Sigil } from "@/components/ui/Icon";

export const LIFE_NOTE_KEY = "xtnl:you:life-note:v1";

export const LIFE_NOTE_COPY =
  "Life now counts toward your character: Body, Duty, Craft and Care feed your attributes, emblem gates, title and level. Kept weeks raise each track's cap.";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** window.localStorage, or null where there is none or touching it throws. */
function localStorageOrNull(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Was the note dismissed? Missing or failing storage reads as no (the note shows). */
export function readNoteDismissed(storage: StorageLike | null | undefined, key: string = LIFE_NOTE_KEY): boolean {
  try {
    return storage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** Remember a dismissal; false when it could not be stored (the note then hides for this view only). */
export function writeNoteDismissed(storage: StorageLike | null | undefined, key: string = LIFE_NOTE_KEY): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function LifeNote({ storageKey = LIFE_NOTE_KEY }: { storageKey?: string }) {
  const stored = useSyncExternalStore(
    subscribe,
    () => (readNoteDismissed(localStorageOrNull(), storageKey) ? "dismissed" : "show"),
    () => "pending"
  );
  const [hidden, setHidden] = useState(false);
  if (stored !== "show" || hidden) return null;
  return (
    <section className="card life-note" aria-label="Life now counts toward your character">
      <span className="ln-sigils" aria-hidden="true">
        <Sigil track="body" />
        <Sigil track="duty" />
        <Sigil track="craft" />
        <Sigil track="care" />
      </span>
      <p className="ln-copy">{LIFE_NOTE_COPY}</p>
      <Button
        variant="secondary"
        onClick={() => {
          writeNoteDismissed(localStorageOrNull(), storageKey);
          setHidden(true);
          for (const l of listeners) l();
        }}
      >
        Got it
      </Button>
    </section>
  );
}
