import type { GameState } from "./types";
import { noteMoment } from "./runlog";

/**
 * Moments (design M1, "Moments and juice"): what the town has just been
 * given, or has just come through, kept until the screen has shown it.
 *
 * The simulation pushes one when something study earned lands (a supply
 * cart, a settlement of tithes, a requisition filled, an heirloom, a star
 * chart) or when a wave is broken; the town's screen shows each once and
 * marks it seen. A moment is a record, not a reward: its goods were already
 * paid by the rule that pushed it, and it states them in numbers. Nothing in
 * it is hidden or rolled at the showing.
 *
 * Saved with the town, so a delivery waiting when the tab closes is still
 * waiting when it opens. Kept short: MOMENTS_MAX at most.
 */

export type MomentKind = "cart" | "tithe" | "req" | "heirloom" | "chart" | "wave" | "peril" | "audit";

export interface Moment {
  /** Rising within a town; a refounded town counts afresh. */
  id: number;
  kind: MomentKind;
  title: string;
  lines: string[];
  /** A cart's tier (./knowledge TIERS), which sets the colour it is framed in. */
  tier?: number;
  /** What came in, by resource or item key; a tool is `tool:<material>`, as the pulse writes goods. */
  goods?: Record<string, number>;
  /** Game time it happened. */
  at: number;
  /** Shown to the player. */
  seen?: boolean;
}

/** Enough for a day's deliveries from every Field a player keeps, and a wave or two. */
export const MOMENTS_MAX = 12;

/**
 * Records a moment. Past the cap the oldest seen one goes first, so a wave
 * broken while the player is away cannot push out a cart they have not seen;
 * when none has been seen, the oldest goes.
 */
export function pushMoment(s: GameState, m: Omit<Moment, "id" | "at" | "seen">): Moment {
  const list = (s.moments ??= []);
  const id = list.reduce((a, x) => Math.max(a, x.id), 0) + 1;
  const out: Moment = { id, at: s.time, ...m };
  list.push(out);
  // The run's log keeps its own count of what study gave: these few moments do not last the run.
  noteMoment(s, out);
  while (list.length > MOMENTS_MAX) {
    const old = list.findIndex((x) => x.seen);
    list.splice(old >= 0 ? old : 0, 1);
  }
  return out;
}

/** Moments not yet shown, oldest first; of the given kinds only, if any are named. */
export const unseenMoments = (s: GameState, kinds?: ReadonlySet<MomentKind>) =>
  (s.moments ?? []).filter((m) => !m.seen && (!kinds || kinds.has(m.kind)));

/** Marks moments shown. */
export function markSeen(s: GameState, ids: Iterable<number>) {
  const want = new Set(ids);
  for (const m of s.moments ?? []) if (want.has(m.id)) m.seen = true;
}

/** The newest moment's id; 0 before the first. */
export const lastMomentId = (s: GameState) => (s.moments ?? []).reduce((a, x) => Math.max(a, x.id), 0);
