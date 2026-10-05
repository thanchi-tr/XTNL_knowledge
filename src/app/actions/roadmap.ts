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
 * would block every tap behind it), under the page's maxDuration. Start
 * defers nothing: no model sizes or explains a plan-born ('rm:') task
 * (decision 50; contracts §15.6), so life-sizing is never called from here.
 *
 * Refresh: an action that changes the roadmap page calls refresh() on
 * success, so the response carries the re-rendered route (the caller need
 * not router.refresh() as well). saveIntake, draftRoadmap, buildStarter and
 * startManual do not: the intake page navigates to /you/roadmap itself.
 * snoozeAimPrompt and snoozeAimStep only set a cookie, which re-renders the
 * page by itself (Next 16: a cookie set in a Server Function returns the
 * updated UI in the same round trip).
 *
 * Revision 4 (lane R4): snoozeAimPrompt, setAimSuggestions, snoozeAimStep,
 * lowerDepth, confirmDomainAdditions, confirmSessionPicks, moveLine and
 * setLineDomain; the fix round's hideAimPrompt (the LATER line's ×, the
 * 'hide:<day>' cookie) and keepCalibratedDates ([Keep the dates], recorded on
 * the plan). The year-long 'off' cookie is never written any more;
 * dismissAimPrompt is now "Not now" until the Aim card moves off it.
 *
 * Confirm to unlock (contracts §19.5): setActivityVerdicts stores the user's
 * answer to the activity card (ActivityCardAnswer: the kinds ticked to avoid,
 * or "Nothing to avoid", with the key of the words it was given against) on
 * the roadmap; the server refuses a stale key (the card asks again) and
 * quotes the reason from the user's own words, and every later plan path
 * reads it. An AVOID given after Start pauses the started task at once, a
 * must included (the lead's ruling 2: safety overrides the akrasia horizon),
 * and its practice stops counting toward the milestone from that day
 * (ruling 3); the result's `paused` lists them, and the Today task's own
 * unarchiveTask undoes a pause. Every refusal while the card waits — accept,
 * Start, a pick, a re-plan, an edit, a build — points at the card (the cores'
 * pointedRefusal, decision 2).
 *
 * Contract: docs/life-plan/roadmap-contracts.md §R4.
 */
import { after } from "next/server";
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import {
  acceptCore,
  addItemCore,
  applyRemedyCore,
  archiveRoadmapCore,
  buildStarterCore,
  claimDraftCore,
  confirmDomainAdditionsCore,
  confirmSessionPicksCore,
  decideItemCore,
  discardDraftCore,
  editItemCore,
  finishStartCore,
  hideAimPromptCore,
  keepCalibratedDatesCore,
  keepOnTodayCore,
  keepUnflaggedCore,
  logCheckpointCore,
  lowerDepthCore,
  markRoadmapDoneCore,
  moveLineCore,
  replanCore,
  resolveDomainCore,
  returnStartingCore,
  saveIntakeCore,
  setActivityVerdictsCore,
  setAimFigureCore,
  setAimSuggestionsCore,
  setLineDomainCore,
  snoozeAimPromptCore,
  snoozeAimStepCore,
  startAgainCore,
  startManualCore,
  startMilestoneCore,
  startPreview,
  undoAcceptCore,
  undoDiscardCore,
  type ActivityVerdictsResult,
  type AimCookieJar,
  type NewItem,
  type RoadmapDeps,
} from "@/lib/roadmap-server";
import {
  type AcceptChoices,
  type ActivityCardAnswer,
  type AimDepth,
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
import { ACTIVITY_ANSWER_REFUSAL, type CatalogKey } from "@/lib/roadmap-catalog";
import { createDomain } from "./taxonomy";

const SAVE_FAILED = "Couldn't save that. Try again.";
const NO_REF = "That's no longer here. Refresh and try again.";

/** What every action hands its core: after() for the background work (the draft's model call) and the taxonomy's createDomain. */
function depsOf(): RoadmapDeps {
  return {
    defer: (task) => after(task),
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
 * Retired as a writer (F-R4-1, F-R4-5): the year-long 'off' cookie is never
 * written any more. Kept, until R5 moves the Aim card off it, as "Not now"
 * (the 4-week snooze), which is what every × on an aim surface means now.
 */
export async function dismissAimPrompt(): Promise<RoadmapActionResult<null>> {
  return snoozeAimPrompt();
}

// ═══ Revision 4 (roadmap-rev4.md; contracts §14) ════════════════════════════

/**
 * Next's cookies() as the cores' jar (Next 16: cookies() is async; set and
 * delete work in a Server Function, and the response carries the cookie).
 */
async function jarOf(): Promise<AimCookieJar> {
  const store = await cookies();
  return {
    get: (name) => store.get(name)?.value,
    set: (name, value, opts) => {
      store.set(name, value, opts);
    },
    delete: (name) => {
      store.delete(name);
    },
  };
}

/**
 * "Not now" on the empty Aim card or Today's SET line (F-R4-1, F-R4-3): the
 * 4-week 'later:<today>' cookie. No database write, so it works on a
 * writes-off server too; the cookie re-renders the page by itself.
 */
export async function snoozeAimPrompt(): Promise<RoadmapActionResult<null>> {
  try {
    return await snoozeAimPromptCore(await jarOf(), new Date());
  } catch (err) {
    console.error("roadmap snoozeAimPrompt failed:", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/**
 * "Don't suggest this" (false), its Undo and the Settings switch (true)
 * (F-R4-1, F-R4-5): LifeSettings.aimSuggestions, the lasting no that holds on
 * every device. Refuses with writes off; true also clears a legacy 'off'
 * cookie and restarts the back-off ('on:<today>').
 */
export async function setAimSuggestions(on: boolean): Promise<RoadmapActionResult<null>> {
  if (on !== true && on !== false) return { ok: false, error: NO_REF };
  return act("setAimSuggestions", true, async (userId, now) => setAimSuggestionsCore(userId, on, await jarOf(), now, depsOf()));
}

/** "Not now: hide this for a week" on Today's DRAFT or START line (F-R4-3). A cookie only. */
export async function snoozeAimStep(kind: "DRAFT" | "START", id: string): Promise<RoadmapActionResult<null>> {
  if ((kind !== "DRAFT" && kind !== "START") || !isRef(id)) return { ok: false, error: NO_REF };
  try {
    return await snoozeAimStepCore(await jarOf(), kind, id, new Date());
  } catch (err) {
    console.error("roadmap snoozeAimStep failed:", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/** [Choose a lower depth…] (F-R4-11): the only path that lowers a depth, shown on the plan for good. */
export async function lowerDepth(roadmapId: string, to: AimDepth, reason: "CHOICE" | "EXAM"): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("lowerDepth", true, (userId, now) => lowerDepthCore(userId, roadmapId, to, reason, now, depsOf()));
}

/** Gemini's Domain additions (F-R4-21): the chosen ones added, the rest left out, the plan re-dated. */
export async function confirmDomainAdditions(roadmapId: string, version: number, domainIds: string[]): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId) || !Number.isInteger(version) || !Array.isArray(domainIds) || domainIds.length > 40 || !domainIds.every(isRef)) return { ok: false, error: NO_REF };
  return act("confirmDomainAdditions", true, (userId, now) => confirmDomainAdditionsCore(userId, roadmapId, version, domainIds, now, depsOf()));
}

/** A body or care plan's session picks (F-R4-17): [Keep them] or [Use easy, mobility and technique instead]. */
export async function confirmSessionPicks(roadmapId: string, choice: "KEEP" | "EASY"): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId) || (choice !== "KEEP" && choice !== "EASY")) return { ok: false, error: NO_REF };
  return act("confirmSessionPicks", true, (userId, now) => confirmSessionPicksCore(userId, roadmapId, choice, now, depsOf()));
}

/**
 * The user's answer to the activity card (confirm to unlock, contracts
 * §19.5): ActivityCardAnswer — the words' key the card was shown with, the
 * kinds ticked to avoid, and whether they chose "Nothing to avoid". Only
 * these are read from the client, cleaned to their shape (a string key, an
 * array of strings, a boolean); a malformed answer is refused, never read as
 * "nothing to avoid", and the reason is never sent (the server quotes the
 * user's own words). A key other than the words' current one is refused
 * (ACTIVITY_ANSWER_STALE: the page re-reads and the card asks again). On a
 * draft the plan follows in the same write; on an accepted plan `replan`
 * says whether to offer a re-plan, and `paused` lists the started tasks an
 * AVOID took off Today at once, musts included, which from today no longer
 * count toward their milestone (Undo: unarchiveTask). The earlier per-kind list
 * (ActivityAnswer[]) is refused like any malformed answer: it carries no
 * key, so the server couldn't tell which words it was given against.
 */
export async function setActivityVerdicts(roadmapId: string, answer: ActivityCardAnswer): Promise<RoadmapActionResult<ActivityVerdictsResult>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  const o: Partial<Record<keyof ActivityCardAnswer, unknown>> | null = answer && typeof answer === "object" && !Array.isArray(answer) ? (answer as Partial<Record<keyof ActivityCardAnswer, unknown>>) : null;
  const avoid = o && Array.isArray(o.avoid) ? (o.avoid as unknown[]) : null;
  if (!o || typeof o.key !== "string" || o.key.length > 64 || !avoid || avoid.length > 64 || !avoid.every((k) => typeof k === "string") || typeof o.nothingToAvoid !== "boolean") {
    return { ok: false, error: ACTIVITY_ANSWER_REFUSAL };
  }
  const clean: ActivityCardAnswer = { key: o.key, avoid: avoid as CatalogKey[], nothingToAvoid: o.nothingToAvoid };
  return act("setActivityVerdicts", true, (userId, now) => setActivityVerdictsCore(userId, roadmapId, clean, now, depsOf()));
}

/** Moves an outline line to another milestone (F-R4-21). */
export async function moveLine(itemId: string, toMilestoneId: string): Promise<RoadmapActionResult<null>> {
  if (!isRef(itemId) || !isRef(toMilestoneId)) return { ok: false, error: NO_REF };
  return act("moveLine", true, (userId, now) => moveLineCore(userId, itemId, toMilestoneId, now, depsOf()));
}

/** Changes an outline line's Domain (F-R4-21): the plan is re-dated with its coverage. */
export async function setLineDomain(roadmapId: string, lineIndex: number, domainId: string | null): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId) || !Number.isInteger(lineIndex) || (domainId !== null && !isRef(domainId))) return { ok: false, error: NO_REF };
  return act("setLineDomain", true, (userId, now) => setLineDomainCore(userId, roadmapId, lineIndex, domainId, now, depsOf()));
}

// ═══ Revision 4 fix round: shells (lane 0; contracts §15.10) ════════════════

/**
 * "Not now: no aim suggestions for 4 weeks" on the LATER line (fix round): the
 * 'hide:<today>' cookie (roadmap-invite hideCookieValue), which aimPromptOf
 * reads as HIDDEN. A cookie only, like snoozeAimPrompt, so it works on a
 * writes-off server too; the cookie re-renders the page by itself.
 */
export async function hideAimPrompt(): Promise<RoadmapActionResult<null>> {
  try {
    return await hideAimPromptCore(await jarOf(), new Date());
  } catch (err) {
    console.error("roadmap hideAimPrompt failed:", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/**
 * [Keep the dates] on the CALIBRATED offer (fix round, F-R4-11): recorded on
 * the plan (the acceptance's dateOrigin.calibrating loses the inputs measured
 * now; nothing is re-dated), never in a device's localStorage, so the offer
 * doesn't return on another device. Refuses with writes off.
 */
export async function keepCalibratedDates(roadmapId: string): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("keepCalibratedDates", true, (userId, now) => keepCalibratedDatesCore(userId, roadmapId, now, depsOf()));
}
