/**
 * L3-celebrate — client helpers around L0's queue (src/lib/celebrate.ts).
 *
 *   present(ev, extras?)        enqueue a T2/T3 with what only the caller has:
 *                               the art, the backdrop, the node it flies from, the gold action
 *   presentAll(evs, extrasFor?) the same for an action's `celebrations` array (T0/T1 are skipped:
 *                               they render in place, on the caller's own elements)
 *   stage(id, extras) / takeStaged(id)   the registry the CelebrationHost reads when it plays `id`
 *   ackShown(evs)               marks persisted events seen (batched, background fetch, keepalive)
 *   sendPrefs(patch)            saves account Feedback prefs on the same background channel
 *   refreshPending()            asks the host to pull unseen moments now (after a deferred write)
 *   noteShowing(id)             the host's per-tab record: false the first time an id plays here,
 *                               true for a replay (You › Moments) of an id this tab already played
 *   ceremonyEventFor(ev, replay) the event CeremonyBackdrop is given: null unless the art is an emblem;
 *                               on a replay its id is suffixed, so the first-of-depth Cataclysm
 *                               (ceremony-art's markCataclysm) plays once, never on Replay
 *
 * The unlock flow (L4), for example:
 *
 *   const [ascension, ...rest] = res.value.events;
 *   if (firstOfDepth) markCataclysm(ascension.id);   // ceremony-art
 *   present(ascension, { fromEl: coinRef.current }); // the art flies from the tapped coin
 *   presentAll(rest);
 *
 * With no staged art or backdrop, the curtain draws an emblem event with
 * ceremony-art's CeremonyArt and CeremonyBackdrop (the attribute sky band,
 * and the Cataclysm when flagged and the motion is Full), both lazy-loaded.
 * Stage `art` / `backdrop` only to draw something else.
 */
import type { ReactNode } from "react";
import { enqueue } from "@/lib/celebrate";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { accountPatch, type AccountPatch } from "./protocol";

export interface CurtainAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface StagedExtras {
  /** T3: the art in the curtain (default: drawn from facts.art; an emblem through ceremony-art's CeremonyArt). */
  art?: ReactNode;
  /**
   * T3: a backdrop layer behind the art (a sky band, a Cataclysm variant). A still tableau is required of it.
   * Default for an emblem: ceremony-art's CeremonyBackdrop. A backdrop replaces the generic sky band.
   */
  backdrop?: ReactNode;
  /** T3: CSS background for the curtain's sky band (a gradient); the band shows even under a backdrop. */
  sky?: string;
  /** T3: the tapped node the art flies from. */
  fromEl?: Element | null;
  /** T3: the gold primary action (default: See your sheet / Equip now). */
  primary?: CurtainAction;
  /** T2: play inside this element (a result panel, a week card) with no button of its own. */
  target?: Element | null;
}

const staged = new Map<string, StagedExtras>();

export function stage(id: string, extras: StagedExtras): void {
  staged.set(id, extras);
  if (staged.size > 50) staged.delete(staged.keys().next().value as string);
}

export function takeStaged(id: string): StagedExtras | undefined {
  const x = staged.get(id);
  staged.delete(id);
  return x;
}

export function present(ev: CelebrationEvent, extras?: StagedExtras): void {
  if (extras) stage(ev.id, extras);
  enqueue(ev);
}

export function presentAll(evs: readonly CelebrationEvent[] | null | undefined, extrasFor?: (ev: CelebrationEvent) => StagedExtras | undefined): void {
  for (const ev of evs ?? []) {
    if (ev.tier < 2) continue;
    present(ev, extrasFor?.(ev));
  }
}

// ─── Acks (first sight wins, across devices) ────────────────────────────────

export const CELEBRATIONS_URL = "/api/celebrations";
/** The event the host listens for to pull unseen moments now. */
export const REFRESH_EVENT = "xtnl:celebrations";

/** A server row id (cuid). Client ids (t1:…, draft:…, fixture:…) never reach the server. */
const ROW_ID = /^[a-z0-9]{8,40}$/i;
const acked = new Set<string>();
let pending: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** One background POST (never a Server Action: those queue behind and ahead of ticks and answers). */
function post(body: { ack?: string[]; prefs?: AccountPatch }): Promise<boolean> {
  if (typeof fetch !== "function") return Promise.resolve(false);
  return fetch(CELEBRATIONS_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).then(
    (res) => res.ok,
    () => false
  );
}

function flush(): void {
  timer = null;
  const ids = pending;
  pending = [];
  if (ids.length === 0) return;
  void post({ ack: ids }).then((ok) => {
    // Offline or refused: forget we sent them, so the next sight tries again.
    if (!ok) for (const id of ids) acked.delete(id);
  });
}

/** Marks persisted Seals/Ascensions as seen. Safe to call repeatedly; each id is sent once per tab. */
export function ackShown(evs: readonly Pick<CelebrationEvent, "id" | "tier" | "dedupeKey">[]): void {
  for (const ev of evs) {
    if (ev.tier < 2 || !ev.dedupeKey || !ROW_ID.test(ev.id) || acked.has(ev.id)) continue;
    acked.add(ev.id);
    pending.push(ev.id);
  }
  if (pending.length && timer == null) timer = setTimeout(flush, 60);
}

/** Saves the account keys of a Feedback-prefs patch (theme, motion, autoAdvance) in the background. */
export function sendPrefs(patch: unknown): Promise<boolean> {
  const prefs = accountPatch(patch);
  if (Object.keys(prefs).length === 0) return Promise.resolve(false);
  return post({ prefs });
}

export function refreshPending(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(REFRESH_EVENT));
}

// ─── Replays (the Cataclysm plays once) ─────────────────────────────────────

const shownHere = new Set<string>();

/** Records that `id` is being shown in this tab. True when it was already shown here (a replay). */
export function noteShowing(id: string): boolean {
  if (shownHere.has(id)) return true;
  shownHere.add(id);
  if (shownHere.size > 200) shownHere.delete(shownHere.values().next().value as string);
  return false;
}

/**
 * The event the curtain's default backdrop (ceremony-art's CeremonyBackdrop)
 * is given: the attribute sky band behind an emblem, plus the first-of-depth
 * Cataclysm when the unlock flow flagged this id. A replay passes a suffixed
 * id, so the flag never matches and Replay shows the sky band only.
 */
export function ceremonyEventFor<E extends Pick<CelebrationEvent, "id" | "facts">>(ev: E, replay: boolean): Pick<CelebrationEvent, "id" | "facts"> | null {
  if (ev.facts.art?.type !== "emblem") return null;
  return replay ? { id: `${ev.id}#replay`, facts: ev.facts } : { id: ev.id, facts: ev.facts };
}
