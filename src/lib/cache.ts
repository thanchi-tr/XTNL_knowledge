/**
 * Process-local read cache with tag invalidation.
 *
 * **Why this exists.** Measured against the real Supabase instance, a
 * single trivial round trip (`SELECT 1`) costs ~816ms. Nothing about the
 * query shapes in this app is slow — the latency is the network, and it is
 * paid once per round trip. A page issuing four of them cannot be fast no
 * matter how the SQL is written, which is why `/dashboard` measured 3.9s
 * and every route sat above a second.
 *
 * So the goal is not "faster queries", it is *no queries* on the common
 * path. Reads go through `cached()`; writes call `invalidate()` with the
 * tags they touched. A page load immediately after a write pays the real
 * cost once and repopulates; every load after that is served from memory.
 *
 * **Correctness.** Over-invalidating is cheap (one slow page) and
 * under-invalidating shows stale numbers, so the write helpers below are
 * deliberately generous about what they clear. Every entry also carries a
 * TTL as a backstop, so a write path someone forgets to tag self-corrects
 * within seconds rather than persisting until restart.
 *
 * **Scope.** Per-process and in-memory: this is a single-tenant personal
 * instance (see `user.ts`), so there is no cross-user leakage to reason
 * about, and keys are still user-scoped for forward compatibility. On a
 * multi-instance deployment each instance keeps its own copy and each
 * converges within the TTL — acceptable here, and the reason the TTL is
 * seconds rather than minutes.
 */

export type CacheTag =
  /** Field rows: levels, compositions, the taxonomy itself. */
  | "fields"
  /** Idea and Domain rows: due counts, points, the review queue. */
  | "ideas"
  /** Per-user progression: unlocked skills, mastery ledger, debuffs, streaks, bosses. */
  | "progress";

export const ALL_TAGS: CacheTag[] = ["fields", "ideas", "progress"];

/**
 * Short by design. The cache exists to collapse the several round trips of
 * one page load (and the handful of loads in a burst of navigation) into
 * one; it is not trying to hold state for minutes. A stale read can only
 * ever survive this long even if a write forgets to invalidate.
 */
export const DEFAULT_TTL_MS = 20_000;

interface Entry {
  value: unknown;
  expiresAt: number;
  tags: CacheTag[];
}

const store = new Map<string, Entry>();
/** In-flight loads, so a burst of concurrent misses does one query, not N. */
const inflight = new Map<string, Promise<unknown>>();

let hits = 0;
let misses = 0;

/**
 * Reads through the cache, collapsing concurrent misses onto one loader
 * call. The single-flight map matters as much as the cache itself here:
 * without it, a page whose components independently ask for the same data
 * would fire several 816ms queries in parallel on a cold cache.
 */
export async function cached<T>(
  key: string,
  tags: CacheTag[],
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    hits += 1;
    return hit.value as T;
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  misses += 1;
  const promise = loader()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs, tags });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/** Drops every entry carrying any of these tags. Safe to over-call. */
export function invalidate(...tags: CacheTag[]): void {
  if (tags.length === 0) return;
  for (const [key, entry] of store) {
    if (entry.tags.some((t) => tags.includes(t))) store.delete(key);
  }
}

export function invalidateAll(): void {
  store.clear();
}

/** Exposed for the perf script; not used by the app itself. */
export function cacheStats(): { size: number; hits: number; misses: number; hitRate: number } {
  const total = hits + misses;
  return { size: store.size, hits, misses, hitRate: total === 0 ? 0 : hits / total };
}
