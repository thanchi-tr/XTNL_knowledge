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
 * setLineDomain; the progression's rulings: keepMyOrder (a Gemini reorder of
 * the outline undone in one tap) and addAppPractice (the app's practice on a
 * stage of a plan the user writes); the fix round's hideAimPrompt (the LATER line's ×, the
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
 * Revision 5 (contracts §23.1, §23.4; lane 3): up to GOALS_MAX goals.
 * saveIntake takes a SaveTarget — {roadmapId} edits that draft, {createKey}
 * (a client nonce) creates one in the lowest free seat, so a double tap
 * returns the same id; none keeps today's rule (the open draft, else a new
 * one). pauseRoadmap, resumeRoadmap and setGoalLabel are the goal sheets'
 * actions (lane 4 renders them). GOALS_MAX is 1, so a second open goal is
 * refused as before (ANOTHER_ACTIVE) and no answer changes.
 *
 * Contract: docs/life-plan/roadmap-contracts.md §R4, §23.
 */
import { after } from "next/server";
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import {
  acceptCore,
  addAppPracticeCore,
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
  keepMyOrderCore,
  keepOnTodayCore,
  keepUnflaggedCore,
  logCheckpointCore,
  lowerDepthCore,
  markRoadmapDoneCore,
  moveLineCore,
  pauseRoadmapCore,
  replanCore,
  resolveDomainCore,
  resumeRoadmapCore,
  returnStartingCore,
  saveIntakeCore,
  setActivityVerdictsCore,
  setAimFigureCore,
  setAimSuggestionsCore,
  setGoalLabelCore,
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
  type GoalSlot,
  type Intake,
  type ItemDecisionChoice,
  type ItemEdit,
  type PauseChoices,
  type ReplanKind,
  type Remedy,
  type ResumeChoices,
  type RoadmapActionResult,
  type RunStatus,
  type SaveTarget,
  type StartChoices,
  type StartPreview,
} from "@/lib/roadmap-types";
import { ACTIVITY_ANSWER_REFUSAL, type CatalogKey } from "@/lib/roadmap-catalog";
import { createDomain } from "./taxonomy";
// ── Revision 5, lane 8 (contracts §22.14): the TOPICS map's actions ──
import {
  addTopicCore,
  breakIntoTopicsCore,
  chooseTopicCore,
  editTopicCore,
  keepGeminiNameCore,
  keepLayerCore,
  mergeLayerUpCore,
  moveTopicCore,
  setLayersCore,
  setParentsCore,
  skipTopicCore,
  trackClauseAsGoalCore,
  // Aliased: a "use" call name reads as a React hook to eslint (react-hooks/rules-of-hooks); the core is the contract's useMyDomainCore.
  useMyDomainCore as bindMyDomainCore,
  writeTopicsCore,
} from "@/lib/roadmap-server";
import { LAYERS_MAX, LAYERS_MIN, type LayerSetChange, type ParentPick, type TopicDepth, type TopicEdit } from "@/lib/roadmap-types";
// ── Revision 5, lane 10 (contracts §22.14, §22.15): the model phases' cores ──
import { advanceTopicChainCore, breakDownCore, goDeeperCore, rateAgainCore, type TopicChainStep } from "@/lib/roadmap-server";

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
/** A goal's createKey: the client's nonce (roadmap-types SaveTarget). */
const CREATE_KEY = /^[A-Za-z0-9_-]{8,64}$/;
/** A label or a pause reason is short text the core cleans (cleanGoalLabelOf, GOAL_PAUSE_REASON_MAX); anything past this is refused unread. */
const TEXT_MAX = 2_000;

/**
 * saveIntake's target, cleaned to its shape (contracts §23.1): absent or
 * null → null (today's rule); {roadmapId} (a reference) → that draft;
 * {createKey} (8 to 64 of A-Z, a-z, 0-9, '_' and '-') → a new goal. Only
 * the one key is read; anything else is malformed (undefined), and refused.
 */
function saveTargetOf(t: unknown): SaveTarget | null | undefined {
  if (t === undefined || t === null) return null;
  if (typeof t !== "object" || Array.isArray(t)) return undefined;
  const o = t as Partial<Record<"roadmapId" | "createKey", unknown>>;
  if (o.roadmapId !== undefined && o.createKey !== undefined) return undefined;
  if (o.roadmapId !== undefined) return isRef(o.roadmapId) ? { roadmapId: o.roadmapId } : undefined;
  if (typeof o.createKey === "string" && CREATE_KEY.test(o.createKey)) return { createKey: o.createKey };
  return undefined;
}

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

/**
 * The intake: with no target, update the open DRAFT or insert one
 * (claim-first; one row on a double tap); with {roadmapId}, edit that draft
 * (it must be the user's DRAFT); with {createKey}, create a goal in the
 * lowest free seat, the same key returning the same id (contracts §23.1).
 * No free seat: ANOTHER_ACTIVE while GOALS_MAX is 1, GOALS_FULL at 3. The
 * server re-validates every field.
 */
export async function saveIntake(intake: Intake, target: SaveTarget | null = null): Promise<RoadmapActionResult<{ roadmapId: string }>> {
  const clean = saveTargetOf(target);
  if (clean === undefined) return { ok: false, error: NO_REF };
  return act("saveIntake", false, (userId, now) => saveIntakeCore(userId, intake, now, depsOf(), clean));
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

// ── Goals: pause, resume, the label (revision 5; contracts §23.4) ──────────

/**
 * [Pause] (from ACTIVE only; a DRAFT is discarded instead): a live milestone
 * closes as dropped and its practices are kept on Today or archived
 * (`choices.aftercare`, the aftercare path); the goal turns PAUSED with
 * `choices.reason` (≤ GOAL_PAUSE_REASON_MAX), keeps its seat number, its
 * Domains and its AVOIDs, and frees its seat. Only the two choices are read,
 * cleaned to their shape.
 */
export async function pauseRoadmap(roadmapId: string, choices: PauseChoices): Promise<RoadmapActionResult<{ closedMilestoneId: string | null }>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  const o: Partial<Record<keyof PauseChoices, unknown>> | null = choices && typeof choices === "object" && !Array.isArray(choices) ? (choices as Partial<Record<keyof PauseChoices, unknown>>) : null;
  if (!o || (o.aftercare !== "KEEP" && o.aftercare !== "ARCHIVE") || !(o.reason === null || o.reason === undefined || (typeof o.reason === "string" && o.reason.length <= TEXT_MAX))) {
    return { ok: false, error: NO_REF };
  }
  const clean: PauseChoices = { aftercare: o.aftercare, reason: typeof o.reason === "string" ? o.reason : null };
  return act("pauseRoadmap", true, (userId, now) => pauseRoadmapCore(userId, roadmapId, clean, now, depsOf()));
}

/**
 * [Resume] (from PAUSED only): it needs a free seat (else GOALS_FULL, or
 * ANOTHER_ACTIVE at GOALS_MAX 1) and room in the week's hours, takes its old
 * seat when free, and with `choices.redate` moves the unstarted rows by the
 * days paused, as a new version (`version`).
 */
export async function resumeRoadmap(roadmapId: string, choices: ResumeChoices): Promise<RoadmapActionResult<{ slot: GoalSlot; version: number | null }>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  const redate = choices && typeof choices === "object" && !Array.isArray(choices) ? (choices as Partial<Record<keyof ResumeChoices, unknown>>).redate : undefined;
  if (redate !== true && redate !== false) return { ok: false, error: NO_REF };
  return act("resumeRoadmap", true, (userId, now) => resumeRoadmapCore(userId, roadmapId, { redate }, now, depsOf()));
}

/** The goal's own label (≤ GOAL_LABEL_MAX, distinct among DRAFT, ACTIVE and PAUSED goals); null goes back to the Area's name. */
export async function setGoalLabel(roadmapId: string, label: string | null): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId) || !(label === null || (typeof label === "string" && label.length <= TEXT_MAX))) return { ok: false, error: NO_REF };
  return act("setGoalLabel", true, (userId, now) => setGoalLabelCore(userId, roadmapId, label, now, depsOf()));
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

/**
 * [Choose a lower depth…] (F-R4-11): the only path that lowers a depth, shown on the plan for good. Revision 5, lane 8
 * (ruling 50): `to` is a TopicDepth; 6 is a TOPICS plan's only (the core refuses it on LEVELS, in today's words).
 */
export async function lowerDepth(roadmapId: string, to: AimDepth | TopicDepth, reason: "CHOICE" | "EXAM"): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("lowerDepth", true, (userId, now) => lowerDepthCore(userId, roadmapId, to, reason, now, depsOf()));
}

/** Gemini's Domain additions (F-R4-21): the chosen ones added, the rest left out, the plan re-dated. */
export async function confirmDomainAdditions(roadmapId: string, version: number, domainIds: string[]): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId) || !Number.isInteger(version) || !Array.isArray(domainIds) || domainIds.length > 40 || !domainIds.every(isRef)) return { ok: false, error: NO_REF };
  return act("confirmDomainAdditions", true, (userId, now) => confirmDomainAdditionsCore(userId, roadmapId, version, domainIds, now, depsOf()));
}

/**
 * A body or care plan's session picks (F-R4-17): [Keep them], or EASY, the swap to the track's own safe practices
 * ([Use easy, mobility and technique instead] on a body plan, [Use Plan the week ahead and Keep a log instead] on a
 * care plan, less any the user said to avoid). On a plan whose picks need no session confirm (a Field plan's, contracts
 * §20.5): Gemini's practice picks, the one decision accept waits on — KEEP ([Keep Gemini's choices]) sets them CHECKED,
 * DEFAULT ([Use the app's default]; EASY reads the same there) removes the ones that aren't the app's default and the
 * re-fit keeps the default in their stage.
 */
export async function confirmSessionPicks(roadmapId: string, choice: "KEEP" | "EASY" | "DEFAULT"): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId) || (choice !== "KEEP" && choice !== "EASY" && choice !== "DEFAULT")) return { ok: false, error: NO_REF };
  return act("confirmSessionPicks", true, (userId, now) => confirmSessionPicksCore(userId, roadmapId, choice, now, depsOf()));
}

/**
 * [Keep my order] (the lead's ruling 7): Gemini's reorder of the outline put back to the user's own order on the draft in
 * one tap (lines the user moved stay where they put them). Refused when the outline already reads in the user's order.
 */
export async function keepMyOrder(roadmapId: string): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("keepMyOrder", true, (userId, now) => keepMyOrderCore(userId, roadmapId, now, depsOf()));
}

/**
 * [Add the app's practice] on one stage of a plan the user writes (the lead's ruling 6: a re-fit never fills such a
 * plan): one practice a tap, the next the practice progression places on that draft stage (its role-defining kind
 * first), within its room beside the user's own, through the plan's gate; the rest of the plan stays as written.
 * `added`: how many practices the stage gained (one).
 */
export async function addAppPractice(milestoneId: string): Promise<RoadmapActionResult<{ added: number }>> {
  if (!isRef(milestoneId)) return { ok: false, error: NO_REF };
  return act("addAppPractice", true, (userId, now) => addAppPracticeCore(userId, milestoneId, now, depsOf()));
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

// ═══ Revision 5, lane 8: the TOPICS map (contracts §22.14; behind TOPIC_PLANS_LIVE) ═════════════
//
// Each takes the roadmap's id and the map's own references (a topic's key S<n>, U<n> or T<n>; a layer 1..6), cleans
// every argument to its shape (anything else is NO_REF, never read), calls its core and never throws. The cores refuse
// with TOPIC_PLANS_OFF while TOPIC_PLANS_LIVE is false, so nothing here changes a page a user can reach today.

/** A topic's key on the map (roadmap-topics TOPIC_KEY_PATTERN). */
const TOPIC_KEY = /^(S|U|T)([1-9]\d{0,2})$/;
const isTopicKey = (k: unknown): k is string => typeof k === "string" && TOPIC_KEY.test(k);
const isLayer = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= LAYERS_MIN && n <= LAYERS_MAX;
const asObject = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** [Write the topics] (ruling 58): the no-Gemini TOPICS draft of a fresh draft. The intake page navigates itself. */
export async function writeTopics(roadmapId: string): Promise<RoadmapActionResult<{ version: number }>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("writeTopics", false, (userId, now) => writeTopicsCore(userId, roadmapId, now, depsOf()));
}

/** [Break into topics] (ruling 49): an accepted LEVELS plan's TOPICS re-plan draft (version + 1; the live plan stays until accept). */
export async function breakIntoTopics(roadmapId: string): Promise<RoadmapActionResult<{ version: number }>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("breakIntoTopics", true, (userId, now) => breakIntoTopicsCore(userId, roadmapId, now, depsOf()));
}

/** The bands: SET (your count), FEWER, or PLAN_FIRST (the layers past N leave the plan as a note). */
export async function setLayers(roadmapId: string, change: LayerSetChange): Promise<RoadmapActionResult<null>> {
  const o = asObject(change);
  if (!isRef(roadmapId) || !o || (o.kind !== "SET" && o.kind !== "FEWER" && o.kind !== "PLAN_FIRST") || !isLayer(o.layers)) return { ok: false, error: NO_REF };
  const clean: LayerSetChange = { kind: o.kind, layers: o.layers };
  return act("setLayers", true, (userId, now) => setLayersCore(userId, roadmapId, clean, now, depsOf()));
}

/** [Keep these] on one layer. */
export async function keepLayer(roadmapId: string, layer: number): Promise<RoadmapActionResult<{ kept: number }>> {
  if (!isRef(roadmapId) || !isLayer(layer)) return { ok: false, error: NO_REF };
  return act("keepLayer", true, (userId, now) => keepLayerCore(userId, roadmapId, layer, now, depsOf()));
}

/** [Write one]: a topic you name in a band (a free Domain's name in layer 1 is that seed; one of your aim's clauses in the last band is that clause). */
export async function addTopic(roadmapId: string, layer: number, name: string): Promise<RoadmapActionResult<{ key: string }>> {
  if (!isRef(roadmapId) || !isLayer(layer) || typeof name !== "string" || name.length > TEXT_MAX) return { ok: false, error: NO_REF };
  return act("addTopic", true, (userId, now) => addTopicCore(userId, roadmapId, layer, name, now, depsOf()));
}

/** A topic's ▸ sheet: Rename, Merge into…, or Remove. */
export async function editTopic(roadmapId: string, key: string, edit: TopicEdit): Promise<RoadmapActionResult<null>> {
  const o = asObject(edit);
  if (!isRef(roadmapId) || !isTopicKey(key) || !o) return { ok: false, error: NO_REF };
  let clean: TopicEdit;
  if (o.kind === "RENAME" && typeof o.name === "string" && o.name.length <= TEXT_MAX) clean = { kind: "RENAME", name: o.name };
  else if (o.kind === "MERGE" && isTopicKey(o.into)) clean = { kind: "MERGE", into: o.into };
  else if (o.kind === "REMOVE") clean = { kind: "REMOVE" };
  else return { ok: false, error: NO_REF };
  return act("editTopic", true, (userId, now) => editTopicCore(userId, roadmapId, key, clean, now, depsOf()));
}

/** [Move to layer…] (on a draft only). */
export async function moveTopic(roadmapId: string, key: string, layer: number): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId) || !isTopicKey(key) || !isLayer(layer)) return { ok: false, error: NO_REF };
  return act("moveTopic", true, (userId, now) => moveTopicCore(userId, roadmapId, key, layer, now, depsOf()));
}

/** [Builds on…]: topics of the layer before and other goals' Domains (read-only), or the whole layer before. */
export async function setParents(roadmapId: string, key: string, pick: ParentPick): Promise<RoadmapActionResult<null>> {
  const o = asObject(pick);
  if (!isRef(roadmapId) || !isTopicKey(key) || !o) return { ok: false, error: NO_REF };
  let clean: ParentPick;
  if (o.kind === "LAYER") clean = { kind: "LAYER" };
  else if (o.kind === "LINKS" && Array.isArray(o.keys) && o.keys.length <= 16 && o.keys.every(isTopicKey) && Array.isArray(o.crossGoal) && o.crossGoal.length <= 8) {
    const cross: { roadmapId: string; domainId: string }[] = [];
    for (const c of o.crossGoal as unknown[]) {
      const x = asObject(c);
      if (!x || !isRef(x.roadmapId) || !isRef(x.domainId)) return { ok: false, error: NO_REF };
      cross.push({ roadmapId: x.roadmapId, domainId: x.domainId });
    }
    clean = { kind: "LINKS", keys: [...(o.keys as string[])], crossGoal: cross };
  } else return { ok: false, error: NO_REF };
  return act("setParents", true, (userId, now) => setParentsCore(userId, roadmapId, key, clean, now, depsOf()));
}

/** [Use my Domain…]: the topic bound to one of the Area's free Domains; null unbinds it. */
export async function useMyDomain(roadmapId: string, key: string, domainId: string | null): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId) || !isTopicKey(key) || (domainId !== null && !isRef(domainId))) return { ok: false, error: NO_REF };
  return act("useMyDomain", true, (userId, now) => bindMyDomainCore(userId, roadmapId, key, domainId, now, depsOf()));
}

/** A topic's tick (with what it builds on) or untick; `chosen` lists the keys the tick chose. */
export async function chooseTopic(roadmapId: string, key: string, chosen: boolean): Promise<RoadmapActionResult<{ chosen: string[] }>> {
  if (!isRef(roadmapId) || !isTopicKey(key) || (chosen !== true && chosen !== false)) return { ok: false, error: NO_REF };
  return act("chooseTopic", true, (userId, now) => chooseTopicCore(userId, roadmapId, key, chosen, now, depsOf()));
}

/** "I know this" (on a draft, or on an unstarted milestone of an accepted TOPICS plan, for good). */
export async function skipTopic(roadmapId: string, key: string, skip: boolean): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId) || !isTopicKey(key) || (skip !== true && skip !== false)) return { ok: false, error: NO_REF };
  return act("skipTopic", true, (userId, now) => skipTopicCore(userId, roadmapId, key, skip, now, depsOf()));
}

/** [Keep] on a Gemini name behind the count («Gemini · kept · not checked»). */
export async function keepGeminiName(roadmapId: string, key: string): Promise<RoadmapActionResult<null>> {
  if (!isRef(roadmapId) || !isTopicKey(key)) return { ok: false, error: NO_REF };
  return act("keepGeminiName", true, (userId, now) => keepGeminiNameCore(userId, roadmapId, key, now, depsOf()));
}

/** [Merge with the layer above] on an empty layer; `droppedLinks` counts the links between the merged layers. */
export async function mergeLayerUp(roadmapId: string, layer: number): Promise<RoadmapActionResult<{ droppedLinks: number }>> {
  if (!isRef(roadmapId) || !isLayer(layer)) return { ok: false, error: NO_REF };
  return act("mergeLayerUp", true, (userId, now) => mergeLayerUpCore(userId, roadmapId, layer, now, depsOf()));
}

/** [Track as its own goal] (ruling 31): one of the aim's clauses becomes a DUTY draft in a free seat; the same createKey returns the same id. */
export async function trackClauseAsGoal(roadmapId: string, clause: number, createKey: string): Promise<RoadmapActionResult<{ roadmapId: string }>> {
  if (!isRef(roadmapId) || !Number.isInteger(clause) || clause < 0 || clause > 64 || typeof createKey !== "string" || !CREATE_KEY.test(createKey)) return { ok: false, error: NO_REF };
  return act("trackClauseAsGoal", true, (userId, now) => trackClauseAsGoalCore(userId, roadmapId, clause, createKey, now, depsOf()));
}

// ═══ Revision 5, lane 10: the model phases (contracts §22.14, §22.15; ruling 47) ═══════════════════════════════════
//
// [Break it down], [Rate again], [Go deeper] and the chain's poll. Each claims at most one step and returns at once;
// the model call runs in after() under the page's maxDuration, one step per invocation (ruling 47). The roadmap
// pages export `maxDuration = 60` (src/app/you/roadmap/page.tsx and new/page.tsx), and a Server Action runs under its
// page's: a "use server" module exports only async functions, so it can't (and needn't) export its own. Every core
// refuses while its TOPIC_* switch is off, before it reads anything. None refreshes the route: the page's poll
// (roadmap-runtime useTopicChainPoll, in DraftRunning's breakdown wait and the draft's TopicChainCard) calls
// advanceTopicChain every few seconds while RoadmapView.topicChain says a step is left, and re-renders as steps settle.

/** A topic's key on the map (S<n>, U<n> or T<n>; roadmap-topics TOPIC_KEY_PATTERN). */
const CHAIN_TOPIC_KEY = /^(S|U|T)([1-9]\d{0,2})$/;

/**
 * [Break it down] (F-R5-7): Gemini's map of the goal's TOPICS draft (one is written first, with no model, when the
 * goal has none). Claims the chain head, RATE (one of the day's drafts), and returns at once with the RUNNING run.
 */
export async function breakDown(roadmapId: string): Promise<RoadmapActionResult<{ runId: string; status: RunStatus }>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("breakDown", false, (userId, now) => breakDownCore(userId, roadmapId, now, depsOf()));
}

/** [Rate again]: Gemini's difficulty estimate asked again (no reuse, new seeds), then the chain as [Break it down]. */
export async function rateAgain(roadmapId: string): Promise<RoadmapActionResult<{ runId: string; status: RunStatus }>> {
  if (!isRef(roadmapId)) return { ok: false, error: NO_REF };
  return act("rateAgain", false, (userId, now) => rateAgainCore(userId, roadmapId, now, depsOf()));
}

/** [Go deeper] on one topic: narrower topics under it, then their web check (the next step). Allowed only while Gemini's names are on. */
export async function goDeeper(roadmapId: string, key: string): Promise<RoadmapActionResult<{ runId: string; status: RunStatus }>> {
  if (!isRef(roadmapId) || typeof key !== "string" || !CHAIN_TOPIC_KEY.test(key)) return { ok: false, error: NO_REF };
  return act("goDeeper", false, (userId, now) => goDeeperCore(userId, roadmapId, key, now, depsOf()));
}

/**
 * The chain's next step (ruling 47): the step running now, or the next one claimed and run in after(), or `done`.
 * The page's poll calls it with `retry` false; [Try again] (a failed web check, a cap, MAP's replies) and the resume
 * after the Over pre-check ([Check again], [Fewer layers]) pass true (that step is claimed again).
 */
export async function advanceTopicChain(roadmapId: string, retry: boolean = false): Promise<RoadmapActionResult<TopicChainStep>> {
  if (!isRef(roadmapId) || (retry !== true && retry !== false)) return { ok: false, error: NO_REF };
  return act("advanceTopicChain", false, (userId, now) => advanceTopicChainCore(userId, roadmapId, retry, now, depsOf()));
}
