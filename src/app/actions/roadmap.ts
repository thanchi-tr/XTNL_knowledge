"use server";

/**
 * The roadmap's Server Actions (roadmap lane R4: F2, F8, F9, F15, F19, F22).
 * Each takes only references and the user's choices, reads the user id on
 * the server (getCurrentUserId), calls its core in src/lib/roadmap-server.ts,
 * returns `{ok, value} | {ok, error}` and never throws. On a server with
 * writes off every database write refuses with ROADMAP_WRITES_OFF ("Roadmap
 * changes are recorded only on the live app"); the core says so before it
 * reads anything. Nothing is encoded in a URL.
 *
 * draftRoadmap returns at once with the RUNNING run; the model call runs in
 * after() (Next 16 dispatches actions one at a time, so a 37-second action
 * would block every tap behind it), under the page's maxDuration. Start's
 * after() sizing goes through life-sizing applySizing, as capture does.
 *
 * Refresh: an action that changes the roadmap page calls refresh() on
 * success, so the response carries the re-rendered route (the caller need
 * not router.refresh() as well). saveIntake, draftRoadmap, buildStarter and
 * startManual do not: the intake page navigates to /you/roadmap itself.
 * dismissAimPrompt only sets a cookie, which re-renders the page by itself.
 *
 * Contract: docs/life-plan/roadmap-contracts.md §R4.
 */
import { after } from "next/server";
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { applySizing } from "@/lib/life-sizing";
import {
  acceptCore,
  addItemCore,
  applyRemedyCore,
  archiveRoadmapCore,
  buildStarterCore,
  claimDraftCore,
  decideItemCore,
  discardDraftCore,
  editItemCore,
  finishStartCore,
  keepOnTodayCore,
  keepUnflaggedCore,
  logCheckpointCore,
  markRoadmapDoneCore,
  replanCore,
  resolveDomainCore,
  returnStartingCore,
  saveIntakeCore,
  setAimFigureCore,
  startAgainCore,
  startManualCore,
  startMilestoneCore,
  startPreview,
  undoAcceptCore,
  undoDiscardCore,
  type NewItem,
  type RoadmapDeps,
} from "@/lib/roadmap-server";
import {
  AIM_PROMPT_COOKIE,
  AIM_PROMPT_COOKIE_MAX_AGE_S,
  type AcceptChoices,
  type DomainResolution,
  type Intake,
  type ItemDecisionChoice,
  type ItemEdit,
  type ReplanKind,
  type Remedy,
  type RoadmapActionResult,
  type RunStatus,
  type StartChoices,
  type StartPreview,
} from "@/lib/roadmap-types";
import { createDomain } from "./taxonomy";

const SAVE_FAILED = "Couldn't save that. Try again.";
const NO_REF = "That's no longer here. Refresh and try again.";

/** What every action hands its core: after() for the background work, the real sizing, and the taxonomy's createDomain. */
function depsOf(): RoadmapDeps {
  return {
    defer: (task) => after(task),
    applySizing: (templateId) => applySizing(templateId),
    io: { createDomain: (fieldId, name) => createDomain(fieldId, name) },
  };
}

const isRef = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 64;

/** Runs a core with the server's user id; never throws. `refreshOnOk` re-renders the current route in the same response. */
async function act<T>(label: string, refreshOnOk: boolean, fn: (userId: string, now: Date) => Promise<RoadmapActionResult<T>>): Promise<RoadmapActionResult<T>> {
  try {
    const res = await fn(getCurrentUserId(), new Date());
    if (res.ok && refreshOnOk) refresh();
    return res;
  } catch (err) {
    console.error(`roadmap ${label} failed:`, err);
    return { ok: false, error: SAVE_FAILED };
  }
}

// ── Intake and drafting (F2, F7, F8) ────────────────────────────────────────

/** The intake: update the open DRAFT or insert one (claim-first; one row on a double tap). The server re-validates every field. */
export async function saveIntake(intake: Intake): Promise<RoadmapActionResult<{ roadmapId: string }>> {
  return act("saveIntake", false, (userId, now) => saveIntakeCore(userId, intake, now, depsOf()));
}

/** "Draft with Gemini": claims a RUNNING run (or reuses one) and returns at once; the call runs in after(). */
export async function draftRoadmap(roadmapId: string): Promise<RoadmapActionResult<{ runId: string; status: RunStatus }>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("draftRoadmap", false, (userId, now) => claimDraftCore(userId, roadmapId, { force: false }, now, depsOf()));
}

/** "Draft again": force — counted, new seeds, "may return a similar draft". */
export async function redraft(roadmapId: string): Promise<RoadmapActionResult<{ runId: string; status: RunStatus }>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("redraft", true, (userId, now) => claimDraftCore(userId, roadmapId, { force: true }, now, depsOf()));
}

/** "Build from my numbers". */
export async function buildStarter(roadmapId: string): Promise<RoadmapActionResult<{ runId: string }>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("buildStarter", false, (userId, now) => buildStarterCore(userId, roadmapId, now, depsOf()));
}

/** "Write it myself". */
export async function startManual(roadmapId: string): Promise<RoadmapActionResult<{ runId: string }>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("startManual", false, (userId, now) => startManualCore(userId, roadmapId, now, depsOf()));
}

/** Discard the open draft (quiet, with an undo toast). */
export async function discardDraft(roadmapId: string): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("discardDraft", true, (userId, now) => discardDraftCore(userId, roadmapId, now, depsOf()));
}

/** The discard's Undo. */
export async function undoDiscard(roadmapId: string): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("undoDiscard", true, (userId, now) => undoDiscardCore(userId, roadmapId, now, depsOf()));
}

// ── Review (F9) ─────────────────────────────────────────────────────────────

/** Keep, I checked this, or Remove one item. The milestone's own id decides its title. */
export async function decideItem(itemId: string, decision: ItemDecisionChoice): Promise<RoadmapActionResult<null>> {
  if (!isRef(itemId)) return { ok: false, error: NO_REF };
  return act("decideItem", true, (userId, now) => decideItemCore(userId, itemId, decision, now, depsOf()));
}

/** Edit one item (EDITED, YOURS). The milestone's own id edits its title. */
export async function editItem(itemId: string, edit: ItemEdit): Promise<RoadmapActionResult<null>> {
  if (!isRef(itemId)) return { ok: false, error: NO_REF };
  return act("editItem", true, (userId, now) => editItemCore(userId, itemId, edit, now, depsOf()));
}

/** "Write it myself" (and the review editor): add a Domain, topic, practice, step or checkpoint the user wrote (origin USER). */
export async function addItem(milestoneId: string, item: NewItem): Promise<RoadmapActionResult<{ itemId: string }>> {
  if (!isRef(milestoneId)) return { ok: false, error: NO_REF };
  return act("addItem", true, (userId, now) => addItemCore(userId, milestoneId, item, now, depsOf()));
}

/** "Keep this milestone's unflagged suggestions" (KEPT_SUGGESTION, never YOURS). */
export async function keepUnflagged(milestoneId: string): Promise<RoadmapActionResult<{ kept: number }>> {
  if (!isRef(milestoneId)) return { ok: false, error: NO_REF };
  return act("keepUnflagged", true, (userId, now) => keepUnflaggedCore(userId, milestoneId, now, depsOf()));
}

/** A Domain item: check, map, create or drop. */
export async function resolveDomain(itemId: string, resolution: DomainResolution): Promise<RoadmapActionResult<{ domainId: string | null }>> {
  if (!isRef(itemId)) return { ok: false, error: NO_REF };
  return act("resolveDomain", true, (userId, now) => resolveDomainCore(userId, itemId, resolution, now, depsOf()));
}

/** One remedy tap (move the date, re-fit at Light, move trailing milestones to Later). */
export async function applyRemedy(roadmapId: string, remedy: Remedy): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("applyRemedy", true, (userId, now) => applyRemedyCore(userId, roadmapId, remedy, now, depsOf()));
}

// ── Accept (F9) ─────────────────────────────────────────────────────────────

/** "Accept plan". */
export async function acceptPlan(roadmapId: string, choices: AcceptChoices): Promise<RoadmapActionResult<{ version: number }>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("acceptPlan", true, (userId, now) => acceptCore(userId, roadmapId, choices, now, depsOf()));
}

/** The accept toast's Undo. */
export async function undoAccept(roadmapId: string, version: number): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId) || !Number.isInteger(version)) return { ok: false, error: NO_REF };
  return act("undoAccept", true, (userId, now) => undoAcceptCore(userId, roadmapId, version, now, depsOf()));
}

// ── Start (F15) ─────────────────────────────────────────────────────────────

/** The Start sheet's data (read-only; works on a writes-off server, where it says so). */
export async function loadStartPreview(milestoneId: string): Promise<RoadmapActionResult<StartPreview | null>> {
  if (!isRef(milestoneId)) return { ok: false, error: NO_REF };
  try {
    return { ok: true, value: await startPreview(getCurrentUserId(), milestoneId, new Date(), depsOf()) };
  } catch (err) {
    console.error("roadmap loadStartPreview failed:", err);
    return { ok: false, error: "Couldn't load the Start sheet. Try again." };
  }
}

/** Start a milestone (hidden while ROADMAP_GOALS_LIVE is false; the core refuses then too). */
export async function startMilestone(milestoneId: string, choices: StartChoices): Promise<RoadmapActionResult<{ goalId: string }>> {
  if (!isRef(milestoneId)) return { ok: false, error: NO_REF };
  return act("startMilestone", true, (userId, now) => startMilestoneCore(userId, milestoneId, choices, now, depsOf()));
}

/** "Finish starting" an interrupted Start. */
export async function finishStarting(milestoneId: string): Promise<RoadmapActionResult<{ goalId: string }>> {
  if (!isRef(milestoneId)) return { ok: false, error: NO_REF };
  return act("finishStarting", true, (userId, now) => finishStartCore(userId, milestoneId, now, depsOf()));
}

/** Return a stale STARTING milestone to PLANNED. */
export async function returnStarting(milestoneId: string): Promise<RoadmapActionResult<null>> {
  if (!isRef(milestoneId)) return { ok: false, error: NO_REF };
  return act("returnStarting", true, (userId, now) => returnStartingCore(userId, milestoneId, now, depsOf()));
}

/** "Start again" on a dropped milestone. */
export async function startAgain(milestoneId: string): Promise<RoadmapActionResult<{ milestoneId: string }>> {
  if (!isRef(milestoneId)) return { ok: false, error: NO_REF };
  return act("startAgain", true, (userId, now) => startAgainCore(userId, milestoneId, now, depsOf()));
}

// ── Measures and lifecycle (F10, F22) ───────────────────────────────────────

/** "Log a score" for a checkpoint (append-only; a double submit writes once by its nonce). */
export async function logCheckpoint(
  itemLineageId: string,
  score: number,
  outOf: number | null,
  note: string | null,
  nonce: string
): Promise<RoadmapActionResult<null>> {
  if (!isRef(itemLineageId)) return { ok: false, error: NO_REF };
  return act("logCheckpoint", true, (userId, now) => logCheckpointCore(userId, itemLineageId, { score, outOf, note, nonce }, now, depsOf()));
}

/** [Re-plan]: "Re-fit to my numbers" (REFIT) or "Edit by hand" (MANUAL). */
export async function replan(roadmapId: string, kind: ReplanKind): Promise<RoadmapActionResult<{ version: number }>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("replan", true, (userId, now) => replanCore(userId, roadmapId, kind, now, depsOf()));
}

/** [Archive] (danger, TypedConfirm); the dialog asks first whether to archive an open milestone goal too. */
export async function archiveRoadmap(roadmapId: string, opts: { reason: string; archiveGoal: boolean }): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("archiveRoadmap", true, (userId, now) => archiveRoadmapCore(userId, roadmapId, opts, now, depsOf()));
}

/** The ACTIVE header's "Add a figure": the reality check's hours (1–5000) and where they come from (YOURS). */
export async function setAimFigure(roadmapId: string, typicalHours: number, typicalHoursSource: string | null): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("setAimFigure", true, (userId, now) => setAimFigureCore(userId, roadmapId, { typicalHours, typicalHoursSource }, now, depsOf()));
}

/** "Mark the aim done" (a reason is required before the aim is reached). */
export async function markRoadmapDone(roadmapId: string, reason: string | null): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("markRoadmapDone", true, (userId, now) => markRoadmapDoneCore(userId, roadmapId, reason, now, depsOf()));
}

/**
 * Practice aftercare's [Keep on Today]: the finished milestone stops asking
 * about that practice (StartSnapshot.aftercareKept); the task itself stays
 * on Today untouched. `milestoneId` names the roadmap (any milestone of it;
 * the practice is found on the finished milestone holding the template).
 */
export async function keepOnToday(milestoneId: string, templateId: string): Promise<RoadmapActionResult<null>> {
  if (!isRef(milestoneId) || !isRef(templateId)) return { ok: false, error: NO_REF };
  return act("keepOnToday", true, (userId, now) => keepOnTodayCore(userId, milestoneId, templateId, now, depsOf()));
}

/**
 * The Aim card's ×: sets the cookie AIM_PROMPT_COOKIE = 'off' for a year.
 * No database write, so it works on a writes-off server too (the line is a
 * per-browser preference); /you reads the cookie on the server.
 */
export async function dismissAimPrompt(): Promise<RoadmapActionResult<null>> {
  try {
    (await cookies()).set(AIM_PROMPT_COOKIE, "off", { maxAge: AIM_PROMPT_COOKIE_MAX_AGE_S, path: "/", sameSite: "lax", httpOnly: true });
    return { ok: true, value: null };
  } catch (err) {
    console.error("roadmap dismissAimPrompt failed:", err);
    return { ok: false, error: SAVE_FAILED };
  }
}
