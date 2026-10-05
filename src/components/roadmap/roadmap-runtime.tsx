"use client";

/**
 * How the roadmap's client components reach the server (lane R5). The live
 * provider wires the real Server Actions (src/app/actions/roadmap.ts, R4) and
 * the router; the fixtures provider (/dev/style/roadmap, the checks) wires
 * inert stand-ins, so a fixture never writes and never needs a router.
 * Components read `useRoadmapRuntime()`; outside any provider (WeekQuests on
 * Today, AimCard on /you) they get the live actions and no router.
 *
 * Every action returns `{ok, value} | {ok, error}` and never throws; the UI
 * shows the error in the kit's one error voice (ActionError). On a server
 * with writes off every roadmap action refuses with ROADMAP_WRITES_OFF.
 */
import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  acceptPlan,
  addAppPractice,
  addItem,
  applyRemedy,
  archiveRoadmap,
  buildStarter,
  confirmDomainAdditions,
  confirmSessionPicks,
  decideItem,
  discardDraft,
  draftRoadmap,
  editItem,
  finishStarting,
  hideAimPrompt,
  keepCalibratedDates,
  keepMyOrder,
  keepOnToday,
  keepUnflagged,
  loadStartPreview,
  logCheckpoint,
  lowerDepth,
  markRoadmapDone,
  moveLine,
  redraft,
  replan,
  resolveDomain,
  returnStarting,
  saveIntake,
  setActivityVerdicts,
  setAimFigure,
  setAimSuggestions,
  setLineDomain,
  snoozeAimPrompt,
  snoozeAimStep,
  startAgain,
  startManual,
  startMilestone,
  undoAccept,
  undoDiscard,
} from "@/app/actions/roadmap";
import { archiveTask, rescheduleGoal, unarchiveTask } from "@/app/actions/tasks";
import { createField } from "@/app/actions/taxonomy";
import type { RoadmapActionResult } from "@/lib/roadmap-types";

/** Every server call the roadmap UI makes, by its real signature. */
export interface RoadmapActions {
  saveIntake: typeof saveIntake;
  draftRoadmap: typeof draftRoadmap;
  redraft: typeof redraft;
  buildStarter: typeof buildStarter;
  startManual: typeof startManual;
  discardDraft: typeof discardDraft;
  undoDiscard: typeof undoDiscard;
  decideItem: typeof decideItem;
  editItem: typeof editItem;
  /** "Write it myself" and the review editor: an item the user wrote (origin USER). */
  addItem: typeof addItem;
  keepUnflagged: typeof keepUnflagged;
  resolveDomain: typeof resolveDomain;
  applyRemedy: typeof applyRemedy;
  acceptPlan: typeof acceptPlan;
  undoAccept: typeof undoAccept;
  loadStartPreview: typeof loadStartPreview;
  startMilestone: typeof startMilestone;
  finishStarting: typeof finishStarting;
  returnStarting: typeof returnStarting;
  startAgain: typeof startAgain;
  logCheckpoint: typeof logCheckpoint;
  replan: typeof replan;
  archiveRoadmap: typeof archiveRoadmap;
  markRoadmapDone: typeof markRoadmapDone;
  /**
   * Revision 4 (F-R4-1, F-R4-3, F-R4-5): "Not now" on the ASK card and
   * Today's SET line (the 4-week 'later:' cookie; nothing writes the
   * year-long 'off' any more); "Not now: hide this for a week" on Today's
   * DRAFT and START lines; "Don't suggest this" and its Undo (the stored
   * LifeSettings.aimSuggestions).
   */
  snoozeAimPrompt: typeof snoozeAimPrompt;
  /** The LATER line's × (the contract §15.10): the 4-week 'hide:' cookie, so no aim suggestion shows on /you or Today until it lapses. */
  hideAimPrompt: typeof hideAimPrompt;
  snoozeAimStep: typeof snoozeAimStep;
  setAimSuggestions: typeof setAimSuggestions;
  /** [Keep the dates] on a CALIBRATED offer (F-R4-11; the contract §15.10): recorded on the plan, so the offer stays answered on every device. */
  keepCalibratedDates: typeof keepCalibratedDates;
  /** [Choose a lower depth…] (F-R4-11): the only path that lowers a depth. */
  lowerDepth: typeof lowerDepth;
  /** Gemini's Domain additions, each the user's to confirm (F-R4-21). */
  confirmDomainAdditions: typeof confirmDomainAdditions;
  /** A body or care plan's one session-picks confirm (F-R4-17). */
  confirmSessionPicks: typeof confirmSessionPicks;
  /**
   * Constraint safety (contracts §19): the activity card's answer
   * (ActivityCardAnswer: the kinds ticked to avoid, or "Nothing to avoid",
   * with the key of the words it was shown against), stored on the roadmap
   * (R4's setActivityVerdicts → setActivityVerdictsCore → answerActivityCard).
   * No reason is sent: the server quotes the user's own sentence. Words
   * changed meanwhile: refused (ACTIVITY_ANSWER_STALE) and the card asks
   * again. Its `replan` says an ACTIVE plan's unstarted milestones hold kinds
   * the answer changes; its `paused` names the started practices it took off
   * Today (decision 4; the notice's Undo is unarchiveTask).
   */
  setActivityVerdicts: typeof setActivityVerdicts;
  /** Move an outline line to another milestone, or tie it to another Domain (F-R4-21). */
  moveLine: typeof moveLine;
  setLineDomain: typeof setLineDomain;
  /** "Keep my order" (the lead's ruling 7): a Gemini reorder of the outline put back to the user's own order in one tap. */
  keepMyOrder: typeof keepMyOrder;
  /**
   * "Add the app's practice" on a stage of a plan the user writes (the
   * lead's ruling 6; R4's addAppPracticeCore over realism's
   * addStagePracticesOf: the progression's practices for that one stage,
   * within its room beside the user's own, through the gate).
   */
  addAppPractice: typeof addAppPractice;
  /** An accepted roadmap's "Add a figure" (R4's setAimFigureCore): the aim check's hours and their source, the user's. */
  setAimFigure: typeof setAimFigure;
  /**
   * Aftercare's "Keep on Today" (R4's keepOnTodayCore: appends the template to
   * its finished milestone's StartSnapshot.aftercareKept, so the row stops
   * asking). The milestone id names the roadmap; the server finds the holder.
   */
  keepOnToday: typeof keepOnToday;
  /** Aftercare's Archive (tasks.ts archiveCore, with its undo toast). */
  archiveTask: (templateId: string) => Promise<{ ok: true; value: unknown } | { ok: false; error: string }>;
  unarchiveTask: (templateId: string) => Promise<{ ok: true; value: unknown } | { ok: false; error: string }>;
  /** QUESTS_BEHIND's and PAST_DUE's lever: the existing goal Reschedule (the Carried rules apply). */
  rescheduleGoal: (goalId: string, day: string) => Promise<{ ok: true; value: unknown } | { ok: false; error: string }>;
  /** The intake's "New Field…" (taxonomy createField, after a confirm). */
  createField: (name: string) => Promise<{ ok: true; value: { id: string; name: string } } | { ok: false; error: string }>;
}

export const LIVE_ACTIONS: RoadmapActions = {
  saveIntake,
  draftRoadmap,
  redraft,
  buildStarter,
  startManual,
  discardDraft,
  undoDiscard,
  decideItem,
  editItem,
  addItem,
  keepUnflagged,
  resolveDomain,
  applyRemedy,
  acceptPlan,
  undoAccept,
  loadStartPreview,
  startMilestone,
  finishStarting,
  returnStarting,
  startAgain,
  logCheckpoint,
  replan,
  archiveRoadmap,
  markRoadmapDone,
  snoozeAimPrompt,
  hideAimPrompt,
  snoozeAimStep,
  setAimSuggestions,
  keepCalibratedDates,
  lowerDepth,
  confirmDomainAdditions,
  confirmSessionPicks,
  setActivityVerdicts,
  moveLine,
  setLineDomain,
  keepMyOrder,
  addAppPractice,
  setAimFigure,
  keepOnToday,
  archiveTask: (id) => archiveTask(id),
  unarchiveTask: (id) => unarchiveTask(id),
  rescheduleGoal: (goalId, day) => rescheduleGoal(goalId, day),
  createField: (name) => createField(name),
};

/** What a fixture's buttons answer: nothing is saved there. */
export const FIXTURE_REFUSAL = "Fixture: nothing is saved on this page.";

const refuse = async (): Promise<{ ok: false; error: string }> => ({ ok: false, error: FIXTURE_REFUSAL });

export const FIXTURE_ACTIONS: RoadmapActions = {
  saveIntake: refuse,
  draftRoadmap: refuse,
  redraft: refuse,
  buildStarter: refuse,
  startManual: refuse,
  discardDraft: refuse,
  undoDiscard: refuse,
  decideItem: refuse,
  editItem: refuse,
  addItem: refuse,
  keepUnflagged: refuse,
  resolveDomain: refuse,
  applyRemedy: refuse,
  acceptPlan: refuse,
  undoAccept: refuse,
  loadStartPreview: refuse,
  startMilestone: refuse,
  finishStarting: refuse,
  returnStarting: refuse,
  startAgain: refuse,
  logCheckpoint: refuse,
  replan: refuse,
  archiveRoadmap: refuse,
  markRoadmapDone: refuse,
  snoozeAimPrompt: refuse,
  hideAimPrompt: refuse,
  snoozeAimStep: refuse,
  setAimSuggestions: refuse,
  keepCalibratedDates: refuse,
  lowerDepth: refuse,
  confirmDomainAdditions: refuse,
  confirmSessionPicks: refuse,
  setActivityVerdicts: refuse,
  moveLine: refuse,
  setLineDomain: refuse,
  keepMyOrder: refuse,
  addAppPractice: refuse,
  setAimFigure: refuse,
  keepOnToday: refuse,
  archiveTask: refuse,
  unarchiveTask: refuse,
  rescheduleGoal: refuse,
  createField: refuse,
};

export interface RoadmapRuntime {
  actions: RoadmapActions;
  /** Re-renders the page from the server (router.refresh); a no-op on fixtures. */
  refresh: () => void;
  /** Client navigation; a no-op on fixtures. */
  push: (href: string) => void;
  fixture: boolean;
}

const NOOP = () => {};
const OUTSIDE: RoadmapRuntime = { actions: LIVE_ACTIONS, refresh: NOOP, push: NOOP, fixture: false };
const RuntimeContext = createContext<RoadmapRuntime | null>(null);

/** The live provider: the real actions and the router. Rendered by the roadmap pages. */
export function LiveRoadmapProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const value = useMemo<RoadmapRuntime>(() => ({ actions: LIVE_ACTIONS, refresh: () => router.refresh(), push: (href) => router.push(href), fixture: false }), [router]);
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

/** The fixtures provider: inert actions, no router. */
export function FixtureRoadmapProvider({ children }: { children: ReactNode }) {
  const value = useMemo<RoadmapRuntime>(() => ({ actions: FIXTURE_ACTIONS, refresh: NOOP, push: NOOP, fixture: true }), []);
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRoadmapRuntime(): RoadmapRuntime {
  return useContext(RuntimeContext) ?? OUTSIDE;
}

type AnyResult<T> = RoadmapActionResult<T> | { ok: true; value: T } | { ok: false; error: string };

/**
 * Runs one action at a time with its pending state and error; refreshes the
 * page on success. A thrown error (the network) reads as a plain retry line.
 */
export function useRoadmapAction() {
  const runtime = useRoadmapRuntime();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    <T,>(call: (a: RoadmapActions) => Promise<AnyResult<T>>, onOk?: (value: T) => void, opts: { refresh?: boolean } = {}) => {
      setError(null);
      startTransition(async () => {
        try {
          const res = await call(runtime.actions);
          if (res.ok) {
            onOk?.(res.value);
            if (opts.refresh !== false) runtime.refresh();
          } else {
            setError(res.error);
          }
        } catch {
          setError("That didn't go through. Check your connection and try again.");
        }
      });
    },
    [runtime]
  );
  return { run, pending, error, setError, runtime };
}
