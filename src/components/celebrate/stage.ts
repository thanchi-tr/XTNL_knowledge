/**
 * L3-celebrate — client helpers around L0's queue (src/lib/celebrate.ts).
 *
 *   present(ev, extras?)        enqueue a T2/T3 with what only the caller has:
 *                               the art, the backdrop, the node it flies from, the gold action
 *   presentAll(evs, extrasFor?) the same for an action's `celebrations` array (T0/T1 are skipped:
 *                               they render in place, on the caller's own elements)
 *   stage(id, extras) / takeStaged(id)   the registry the CelebrationHost reads when it plays `id`
 *   ackShown(evs)               marks persisted events seen (batched, background fetch, keepalive)
 *   refreshPending()            asks the host to pull unseen moments now (after a deferred write)
 *
 * The unlock flow (L4), for example:
 *
 *   const res = await unlockSkill(code);            // returns celebrations
 *   presentAll(res.celebrations, () => ({
 *     fromEl: coinRef.current,
 *     art: <EmblemCoin rank depth size={168}><SkillLogo skill={s} size={84} animated={false}/></EmblemCoin>,
 *     backdrop: firstApex ? <CataclysmBackdrop variant={v}/> : undefined,
 *     primary: { label: "Equip now", onClick: () => router.push("/you/loadout") },
 *   }));
 */
import type { ReactNode } from "react";
import { enqueue } from "@/lib/celebrate";
import type { CelebrationEvent } from "@/lib/celebration-types";

export interface CurtainAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface StagedExtras {
  /** T3: the art in the curtain (default: drawn from facts.art). */
  art?: ReactNode;
  /** T3: a backdrop layer behind the art (a sky band, a Cataclysm variant). A still tableau is required of it. */
  backdrop?: ReactNode;
  /** T3: CSS background for the curtain's sky band (a gradient). */
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

function flush(): void {
  timer = null;
  const ids = pending;
  pending = [];
  if (ids.length === 0 || typeof fetch !== "function") return;
  void fetch(CELEBRATIONS_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ack: ids }),
    keepalive: true,
  }).catch(() => {
    // Offline: forget we sent them, so the next sight tries again.
    for (const id of ids) acked.delete(id);
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

export function refreshPending(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(REFRESH_EVENT));
}
