/**
 * Which of the 32 loadout shapes this browser has ever actually assembled.
 *
 * Deliberately client-only and localStorage-backed, not a DB table: which
 * shapes you've seen is flavour, not economy — the server folds every set's
 * grant into `ActiveModifiers` regardless of whether the discovery popup
 * ever fired, so a cleared browser loses nothing except the memory of having
 * seen the popup once. That's also what keeps this out of the schema: a
 * feature that exists purely to make a first assembly feel like an event
 * doesn't need to survive a device change.
 *
 * The set of *names* that have ever been seen is intentionally the only
 * thing persisted — not which loadout produced them, not when. The codex
 * only ever needs "have I met this shape before", never a history of it.
 */

const STORAGE_KEY = "xtnl:seenSets:v1";

function readSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const ids: unknown = JSON.parse(raw);
    return Array.isArray(ids) ? new Set(ids.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    // A corrupted or blocked localStorage should never break the loadout bar
    // itself — worst case, every shape looks undiscovered again.
    return new Set();
  }
}

function writeSeen(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Quota or privacy-mode failure — the popup still fires this session,
    // it just may fire again next time. Not worth surfacing an error for.
  }
}

export function loadSeenSetIds(): Set<string> {
  return readSeen();
}

/** Marks `ids` as seen and returns only the ones that were genuinely new. */
export function markSetsSeen(ids: string[]): string[] {
  const seen = readSeen();
  const fresh = ids.filter((id) => !seen.has(id));
  if (fresh.length === 0) return [];
  for (const id of fresh) seen.add(id);
  writeSeen(seen);
  return fresh;
}
