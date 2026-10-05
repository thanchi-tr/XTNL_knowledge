/**
 * What this tab saw happen to a started milestone's Today tasks after an
 * answer about activities (the lead's ruling 3: the roadmap says how each
 * one stands, never silently). The save's reply says which tasks were taken
 * off Today (R4's `paused`) and which couldn't be (`notPaused`: still
 * there); the notice's Undo brings one back. The view carries no task state
 * yet, so the page keeps what it saw here, per roadmap and template, for as
 * long as the tab lives (a reload starts empty, and a task the page saw
 * nothing happen to reads as the answer left it: roadmap-ui-model
 * pausedItemsOf).
 *
 * Written only from the client's event handlers (announceActivitySaved and
 * its Undo); read with usePauseSeen. Both snapshots read the same store, so a
 * server render (where nothing is ever written) and the first hydration see
 * it empty.
 */
import { useSyncExternalStore } from "react";
import type { TaskSeen } from "./roadmap-ui-model";

const EMPTY: ReadonlyMap<string, TaskSeen> = new Map();
const byRoadmap = new Map<string, ReadonlyMap<string, TaskSeen>>();
const listeners = new Set<() => void>();

/** Records what happened to these tasks of a roadmap (a later entry for a template replaces the earlier one). */
export function notePauseSeen(roadmapId: string, entries: readonly { templateId: string; seen: TaskSeen }[]): void {
  if (!roadmapId || entries.length === 0) return;
  const next = new Map(byRoadmap.get(roadmapId) ?? EMPTY);
  for (const e of entries) if (e.templateId) next.set(e.templateId, e.seen);
  byRoadmap.set(roadmapId, next);
  for (const l of [...listeners]) l();
}

/** What this tab saw for a roadmap's tasks (one stable map until the next note). */
export function pauseSeenOf(roadmapId: string | null | undefined): ReadonlyMap<string, TaskSeen> {
  return (roadmapId && byRoadmap.get(roadmapId)) || EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The page's read of pauseSeenOf, re-rendering when a save or an Undo notes something. */
export function usePauseSeen(roadmapId: string | null | undefined): ReadonlyMap<string, TaskSeen> {
  return useSyncExternalStore(
    subscribe,
    () => pauseSeenOf(roadmapId),
    () => pauseSeenOf(roadmapId)
  );
}
