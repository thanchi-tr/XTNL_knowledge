/**
 * L3-celebrate — the CelebrationHost's background channel, as pure data
 * (shared by the host, stage.ts and the /api/celebrations route; no React,
 * no database, client-safe: it imports only celebration-types).
 *
 *   GET  /api/celebrations            → { pending: CelebrationEvent[], prefs: AccountPatch | null }
 *   POST /api/celebrations  { ack?: string[], prefs?: AccountPatch } → { acked, saved }
 *
 *   ACCOUNT_PREF_KEYS             the Feedback keys that follow the account (sound and haptics stay per device)
 *   accountPatch(raw)             only valid values of account keys, as given (a fallback is never invented)
 *   planPrefsSync(local, server)  per key: a value the account chose wins (apply it on this device, without
 *                                 saving it back); a key the account never chose is seeded from this device
 *                                 when the device chose one
 *   readPostBody(body)            an untrusted POST body → { ack, prefs } (the route still cleans the ids)
 *
 * Prefs travel here rather than through the savePrefs Server Action because
 * Server Actions dispatch one at a time per client: a background write on
 * first load must never queue ahead of a tick or a review answer.
 */
import { DEFAULT_PREFS, parsePrefs, type FeedbackPrefs } from "@/lib/celebration-types";

export const ACCOUNT_PREF_KEYS = ["theme", "motion", "autoAdvance"] as const;
export type AccountPrefKey = (typeof ACCOUNT_PREF_KEYS)[number];
export type AccountPatch = Partial<Pick<FeedbackPrefs, AccountPrefKey>>;

/** Only the account keys whose value is valid as given (parsePrefs falls back to a default otherwise). */
export function accountPatch(raw: unknown): AccountPatch {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const given = raw as Record<string, unknown>;
  const parsed = parsePrefs(given);
  const out: Record<string, string> = {};
  for (const k of ACCOUNT_PREF_KEYS) {
    if (k in given && given[k] === parsed[k]) out[k] = parsed[k];
  }
  return out as AccountPatch;
}

export interface PrefsSyncPlan {
  /** The account's choices that differ from this device: apply here, never save back. */
  apply: AccountPatch;
  /** Keys the account never chose that this device did: save them once. */
  seed: AccountPatch;
}

export function planPrefsSync(local: FeedbackPrefs, server: unknown): PrefsSyncPlan {
  const theirs = accountPatch(server);
  const apply: Record<string, string> = {};
  const seed: Record<string, string> = {};
  for (const k of ACCOUNT_PREF_KEYS) {
    const v = theirs[k];
    if (v !== undefined) {
      if (v !== local[k]) apply[k] = v;
    } else if (local[k] !== DEFAULT_PREFS[k]) {
      seed[k] = local[k];
    }
  }
  return { apply: apply as AccountPatch, seed: seed as AccountPatch };
}

export interface PostBody {
  /** Raw ids; the server keeps only row ids of this user (rowIds). */
  ack: unknown[];
  prefs: AccountPatch;
}

export function readPostBody(body: unknown): PostBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ack: [], prefs: {} };
  const b = body as { ack?: unknown; prefs?: unknown };
  return { ack: Array.isArray(b.ack) ? b.ack.slice(0, 200) : [], prefs: accountPatch(b.prefs) };
}
