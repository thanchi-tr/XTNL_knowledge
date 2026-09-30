"use server";

/**
 * L3-celebrate — the celebration and Feedback-prefs actions. The signatures
 * are the frozen contract L0 stubbed; `ackCelebrations` and `loadPrefs` are
 * additive.
 *
 *   listPending()           → CelebrationEvent[]   unseen T2/T3, oldest first
 *   ackCelebration(id)      → void                 sets shownAt, so nothing replays on the other device
 *   ackCelebrations(ids)    → number               the same for several (the in-panel Seals of a recap)
 *   listMoments()           → CelebrationEvent[]   every T2/T3 for You › Moments, newest first
 *   savePrefs(patch)        → { ok, prefs }        Settings › Feedback, persisted in UserPrefs
 *   loadPrefs()             → the account's chosen theme / motion / autoAdvance (only keys ever saved), or null
 *
 * The CelebrationHost does not use these for its background traffic: it
 * talks to /api/celebrations with fetch, because Server Actions dispatch one
 * at a time per client and a background ack must never hold up a review
 * answer or a tick. Every action here fails soft (the tables may not exist
 * until the lead applies the migration).
 */
import { getCurrentUserId } from "@/lib/user";
import { ackFor, listMomentsFor, listPendingFor, loadPrefsFor, savePrefsFor, cleanPrefsPatch, type AccountPrefs } from "@/lib/celebrations";
import { parsePrefs, type CelebrationEvent, type FeedbackPrefs } from "@/lib/celebration-types";

export async function listPending(): Promise<CelebrationEvent[]> {
  try {
    return await listPendingFor(getCurrentUserId());
  } catch (err) {
    console.error("[celebrations] listPending", err);
    return [];
  }
}

export async function ackCelebration(id: string): Promise<void> {
  try {
    await ackFor(getCurrentUserId(), [id]);
  } catch (err) {
    console.error("[celebrations] ack", err);
  }
}

export async function ackCelebrations(ids: string[]): Promise<number> {
  try {
    return await ackFor(getCurrentUserId(), Array.isArray(ids) ? ids : []);
  } catch (err) {
    console.error("[celebrations] ack", err);
    return 0;
  }
}

export async function listMoments(): Promise<CelebrationEvent[]> {
  try {
    return await listMomentsFor(getCurrentUserId());
  } catch (err) {
    console.error("[celebrations] listMoments", err);
    return [];
  }
}

export async function savePrefs(patch: Partial<FeedbackPrefs>): Promise<{ ok: boolean; prefs: FeedbackPrefs }> {
  try {
    return { ok: true, prefs: await savePrefsFor(getCurrentUserId(), patch) };
  } catch (err) {
    console.error("[celebrations] savePrefs", err);
    // Not stored: the localStorage mirror the pre-paint script reads still holds it on this device.
    return { ok: false, prefs: parsePrefs(cleanPrefsPatch(patch)) };
  }
}

export async function loadPrefs(): Promise<Partial<AccountPrefs> | null> {
  try {
    return await loadPrefsFor(getCurrentUserId());
  } catch (err) {
    console.error("[celebrations] loadPrefs", err);
    return null;
  }
}
