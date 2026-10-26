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
 * **A load in flight across a write.** `invalidate()` also bumps each of its
 * tags' generation. A load that began before the bump (so it may have read
 * the rows from before the write) is neither stored when it resolves nor
 * handed to a caller who arrives after the write: that caller starts a load
 * of its own. Without it, a read racing a write could be cached for the
 * whole TTL with the write missing (the credits wallet read after a tick,
 * say, joining a load that left before the tick committed).
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
  | "progress"
  /** The life system's slow-moving rows: task templates, life settings, tracks, workouts. */
  | "life"
  /** The life ledger and everything read from it: the daily streak, the Today board, day totals. */
  | "activity"
  /** Body weight readings and the weight goal (src/lib/weight-server.ts). */
  | "weight"
  /** The roadmap: Aim, milestones, readings, Proficiency and week quests (src/lib/roadmap-*.ts). */
  | "roadmap"
  /** Exercise sessions (src/lib/exercise-server.ts). */
  | "exercise"
  /** Check-ins and their prefs: the pause and the low-pattern card's last hide (MoodCheck, MindPrefs; src/lib/mind-server.ts). */
  | "mind"
  /** Word completion's record of the user's picks and passes (WordChoice; src/lib/vocabulary.ts). */
  | "words"
  /**
   * A work tab's own lists (2026-10-20): its customers and scheduled tasks, as the Office workspace's search index
   * reads them (scheduled-tasks-server loadWorkIndex; since Phase 2 with their open task collections), and the
   * follow-ups' facts (crm-server loadFollowUpFacts). Customer, log, scheduled task and collection writes clear it.
   * Not the shell's.
   */
  | "work";

/**
 * Every tag the shell's read depends on (shell-data.ts). Not 'words': word
 * completion's choices are cleared on every flush and nothing in the shell
 * reads them, so the shell does not rebuild for them. Not 'work' either: the
 * work tabs' search index is read by the work frame, never by the shell.
 */
export const ALL_TAGS: CacheTag[] = ["fields", "ideas", "progress", "life", "activity", "weight", "roadmap", "exercise", "mind"];

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

/** A load in flight, and the generation of its tags when it began. */
interface Flight {
  promise: Promise<unknown>;
  generation: string;
}

const store = new Map<string, Entry>();
/** In-flight loads, so a burst of concurrent misses does one query, not N. */
const inflight = new Map<string, Flight>();
/** Each tag's generation: invalidate() bumps it. `everything` is invalidateAll()'s, which every key depends on. */
const generations = new Map<CacheTag, number>();
let everything = 0;

/** The generation a load over `tags` begins at: it changes whenever any of them (or everything) is invalidated. */
function generationOf(tags: readonly CacheTag[]): string {
  let g = String(everything);
  for (const t of tags) g += `:${generations.get(t) ?? 0}`;
  return g;
}

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

  // Join a load only if it began after the last write to these tags: one from before it may miss that write.
  const generation = generationOf(tags);
  const pending = inflight.get(key);
  if (pending && pending.generation === generation) return pending.promise as Promise<T>;

  misses += 1;
  const promise: Promise<T> = loader()
    .then((value) => {
      // Stored only when no write to its tags landed while it ran (else the next caller loads again).
      if (generationOf(tags) === generation) store.set(key, { value, expiresAt: Date.now() + ttlMs, tags });
      return value;
    })
    .finally(() => {
      if (inflight.get(key)?.promise === promise) inflight.delete(key);
    });

  inflight.set(key, { promise, generation });
  return promise;
}

/** Drops every entry carrying any of these tags, and retires the loads in flight over them. Safe to over-call. */
export function invalidate(...tags: CacheTag[]): void {
  if (tags.length === 0) return;
  for (const t of new Set(tags)) generations.set(t, (generations.get(t) ?? 0) + 1);
  for (const [key, entry] of store) {
    if (entry.tags.some((t) => tags.includes(t))) store.delete(key);
  }
}

export function invalidateAll(): void {
  everything += 1;
  store.clear();
}

/** Exposed for the perf script; not used by the app itself. */
export function cacheStats(): { size: number; hits: number; misses: number; hitRate: number } {
  const total = hits + misses;
  return { size: store.size, hits, misses, hitRate: total === 0 ? 0 : hits / total };
}
