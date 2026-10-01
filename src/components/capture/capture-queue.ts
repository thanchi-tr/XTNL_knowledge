/**
 * Unsent lines retry themselves (capture.md 'Unsent lines retry themselves'),
 * the pure part: the retry schedule, what counts as a network failure, and
 * the queue of lines waiting to go again. QuickCapture owns the timers,
 * the triggers (mount, 'online', the tab becoming visible, the sheet
 * opening) and the in-flight Set; every rule they follow is here, so
 * scripts/today-ui-check.ts can hold it without a clock or a network.
 *
 * A retry is always safe: each line carries its own capture key (its
 * nonce), and the server finds the row an earlier send already wrote
 * instead of writing a second.
 */

/** Delays before the 1st … 4th automatic attempt; after the 4th fails, the line joins the failed list. */
export const RETRY_DELAYS_MS: readonly number[] = [2_000, 10_000, 60_000, 300_000];
export const MAX_AUTO_ATTEMPTS = RETRY_DELAYS_MS.length;
/** A pending line from an earlier page load with no answer after this long is retried (never just filed as failed). */
export const PENDING_STALE_MS = 15_000;

/**
 * How long to wait before the next automatic attempt, given how many
 * automatic attempts have already failed: 2 s, 10 s, 60 s, 300 s, then
 * null (stop).
 */
export function nextRetryDelay(attempts: number): number | null {
  if (!Number.isInteger(attempts) || attempts < 0 || attempts >= RETRY_DELAYS_MS.length) return null;
  return RETRY_DELAYS_MS[attempts];
}

/**
 * Whether a failed send is worth retrying. A thrown action — a fetch that
 * never reached the server, a dropped response, an action the server never
 * answered — is; a server answer, even a refusal ({ ok: false }), is not:
 * the network worked and the same line would be refused again.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (error && typeof error === "object" && "ok" in error && (error as { ok: unknown }).ok === false) return false;
  return true;
}

export interface QueueItem {
  nonce: string;
  /** Automatic attempts that have failed so far. */
  attempts: number;
  /** When it may go next (epoch ms). */
  nextAt: number;
}

export type Queue = readonly QueueItem[];

/**
 * Adds a line to the queue. One entry per nonce: adding a line that is
 * already queued keeps the earlier schedule (the same nonce is never
 * queued, or sent, twice).
 */
export function queueAdd(q: Queue, nonce: string, nextAt: number, attempts = 0): QueueItem[] {
  if (q.some((i) => i.nonce === nonce)) return [...q];
  return [...q, { nonce, attempts, nextAt }];
}

export function queueRemove(q: Queue, nonce: string): QueueItem[] {
  return q.filter((i) => i.nonce !== nonce);
}

/**
 * The lines to send now: due by their schedule, or every one of them when
 * a trigger says so (back online, the tab visible again, the sheet opened)
 * — but never one already in flight.
 */
export function queueDue(q: Queue, now: number, inFlight: ReadonlySet<string>, all = false): string[] {
  return q.filter((i) => !inFlight.has(i.nonce) && (all || i.nextAt <= now)).map((i) => i.nonce);
}

/** A manual Retry sends now, pre-empting the timer — unless that line is already in flight. */
export function mayRetryNow(nonce: string, inFlight: ReadonlySet<string>): boolean {
  return !inFlight.has(nonce);
}

/**
 * What a send's outcome does to the queue. Saved or refused: the line
 * leaves the queue. A network failure: it waits for the next delay —
 * counting the attempt only when it was automatic (the first send and a
 * manual Retry do not use one up) — or, past the last delay, leaves with
 * `giveUp` so the sheet files it as failed.
 */
export function queueSettle(
  q: Queue,
  nonce: string,
  outcome: "saved" | "refused" | "network",
  now: number,
  automatic: boolean
): { queue: QueueItem[]; giveUp: boolean } {
  if (outcome !== "network") return { queue: queueRemove(q, nonce), giveUp: false };
  const current = q.find((i) => i.nonce === nonce);
  const attempts = (current?.attempts ?? 0) + (automatic ? 1 : 0);
  const delay = nextRetryDelay(attempts);
  if (delay === null) return { queue: queueRemove(q, nonce), giveUp: true };
  const item: QueueItem = { nonce, attempts, nextAt: now + delay };
  return { queue: current ? q.map((i) => (i.nonce === nonce ? item : i)) : [...q, item], giveUp: false };
}

/** When the earliest idle line falls due (for one timer), or null. */
export function queueWake(q: Queue, inFlight: ReadonlySet<string>): number | null {
  let at: number | null = null;
  for (const i of q) {
    if (inFlight.has(i.nonce)) continue;
    if (at === null || i.nextAt < at) at = i.nextAt;
  }
  return at;
}
