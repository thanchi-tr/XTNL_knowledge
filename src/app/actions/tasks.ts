"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/user";
import type { CaptureSpan } from "@/lib/capture-parse";
import type { DayKey } from "@/lib/life-day";
import { applySizing } from "@/lib/life-sizing";
import { captureSnapshot, detectCelebrations, type CaptureOptions } from "@/lib/celebrations";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { withMoments } from "@/lib/today-board";
import { closeGoalCore, prepareRoadmapGoalClose, rescheduleGoalCore } from "@/lib/goals-server";
import { closeDecision, type GoalPayout } from "@/lib/goals";
import { lifeWritesEnabled } from "@/lib/life-economy";
import { recordPracticeForTemplate } from "@/lib/roadmap-readings";
import { createFromCapture, type CapturedItem } from "./capture";
import {
  againCore,
  archiveCore,
  clarifyInboxCore,
  completeInstanceCore,
  goalProgressCore,
  renameCore,
  rescheduleCore,
  resizableCore,
  setBandOverrideCore,
  setDailyCapacityCore,
  skipCore,
  stepTickCore,
  templateIdOfInstance,
  unarchiveCore,
  undoCaptureCore,
  undoCompletionCore,
  type ClarifyOutcome,
  type Completion,
  type InboxChoice,
  type LifeResult,
  type RuleChangeOutcome,
  type StepTick,
  type UnarchiveOutcome,
} from "@/lib/tasks";
import { undoMakeUpCore } from "@/lib/duty";
import { MAKE_UP_UNDO_ELSEWHERE } from "@/lib/duty-plan";
import { abortCore, deferCore, undoDecisionCore, type DecisionOutcome, type UndoneDecision } from "@/lib/task-decisions-server";
import { discardTimerCore, startTimerCore, stopTimerCore } from "@/lib/task-sessions-server";
import { TIMER_CLIENT_ID, cleanTickProof, isSessionSource, type SessionSource, type TickProofInput, type TimerView } from "@/lib/proof";

/**
 * The task actions: the Today board's writes, plus a text capture.
 *
 * Every action takes only a reference and the change (an id, a slot, some
 * minutes) and reads the rest on the server; no price, day or status the
 * browser sends is trusted. Numbers are clamped in the core. Each returns the
 * same `{ok, value} | {ok, error}` shape as the other actions, never throws,
 * and calls `refresh()` when asked — the board passes `{ refresh: true }` so
 * the response carries the re-rendered page in the same round trip, which is
 * what its optimistic state reconciles against. Callers elsewhere (the
 * capture toast on /review, say) leave it off so a review session is never
 * re-rendered under the player.
 *
 * The writes that can move a streak, a habit rung or a goal (completeTask,
 * againTask, goalProgress) also return L3's moments as `celebrations`: a
 * snapshot before and after with the same scope, diffed by
 * detectCelebrations (redesign.md › Rewards). The board presents the
 * T2/T3s; it chimes its own T1s, so it ignores the returned ones.
 *
 * Goals (M5): closeGoal pays a goal's stated MP once, within the gates in
 * goals.ts (closeGoal returns its moments too); previewGoalClose is the same
 * decision, read-only (a roadmap milestone's preview records its readings
 * first: F16 seam 6); rescheduleGoal moves only the due day. No UI calls
 * them until the Today integration (phase B).
 *
 * Roadmap (docs/life-plan/roadmap.md F16 seam 6): every completion and undo
 * hands its template to the roadmap's practice writer in after()
 * (recordPracticeAfter), so a started milestone's practice and step ticks
 * reach its readings, Proficiency and week quests at once.
 */

export type TaskActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface TaskActionOptions {
  /** Re-render the current route in this response. The Today board sets it. */
  refresh?: boolean;
}

async function run<T>(label: string, opts: TaskActionOptions | undefined, fn: (userId: string) => Promise<LifeResult<T>>): Promise<TaskActionResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

/**
 * Roadmap (F16 seam 6): after a completion or an undo, the roadmap's practice
 * writer (roadmap-readings recordPracticeForTemplate) re-reads that
 * template's milestone: its PRACTICE_KEPT reading, its steps share, the
 * reach rules and Proficiency, so an undo clears a pending reach. It returns
 * at once for any template outside its cached scope map (everything but a
 * started milestone's practices and steps), so this hook needs no
 * captureKey and the tick pays no read for it. Scheduled for every template,
 * only where life writes are on (decision 13), after the response; it never
 * fails the tick. A function stands for a template id read only then (the
 * make-up's Undo, whose result does not name it).
 */
function recordPracticeAfter(userId: string, templateId: string | (() => Promise<string | null>)): void {
  if (!lifeWritesEnabled()) return;
  after(async () => {
    try {
      const id = typeof templateId === "function" ? await templateId() : templateId;
      if (id) await recordPracticeForTemplate(userId, id);
    } catch (err) {
      console.error("[roadmap] the practice reading after a tick failed", err);
    }
  });
}

/** A write's value plus L3's moments for it (T1s the board ignores: it chimes its own). */
export type WithCelebrations<T> = T & { celebrations: CelebrationEvent[] };

/**
 * L3's detectors around one write (today-board.ts withMoments): the snapshot
 * before, the write, the snapshot after with the same options, the diff.
 * Never fails the write; a refused or repeated write takes no second snapshot.
 */
function aroundTick<T>(
  userId: string,
  snap: CaptureOptions,
  write: () => Promise<LifeResult<T>>,
  changed?: (value: T) => boolean
): Promise<LifeResult<WithCelebrations<T>>> {
  return withMoments({
    // Each snapshot reads at its own instant (captureSnapshot's default); both with the same scope.
    snapshot: () => captureSnapshot(userId, snap),
    detect: (before, after) => detectCelebrations(before, after, { cause: "tick" }),
    write,
    changed,
  });
}

const isId = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 64;
const noId = <T>(): TaskActionResult<T> => ({ ok: false, error: "No task given." });
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Captures one line as a task. The same path as the capture sheet's
 * createFromCapture — one parse, one set of input clamps
 * (sanitizeCaptureInput), one sizing rule (none for goals and idea drafts)
 * and the same retry key — so the two entry points cannot drift apart.
 */
export async function createTask(
  text: string,
  reverted?: CaptureSpan[],
  opts?: TaskActionOptions & { captureKey?: string }
): Promise<TaskActionResult<CapturedItem>> {
  try {
    return await createFromCapture(text, reverted, { refresh: opts?.refresh === true, captureKey: opts?.captureKey });
  } catch (err) {
    console.error("createTask failed:", err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

export interface CompleteTaskInput {
  /**
   * The row's own life day (row.day), or 'today' / 'yesterday'. Send the
   * DayKey: the server books only today or yesterday by its own clock, so a
   * board left open across 04:00 is refused rather than booked a day off.
   */
  day?: "today" | "yesterday" | DayKey;
  /** Ignored: the server picks the slot (the first of the day; 'Again' is againTask). Kept so old callers still type-check. */
  slot?: number;
  minutes?: number | null;
  mvv?: boolean;
  /**
   * Proof of work (blueprint P23): the timer this tick counts (startTaskTimer's sessionId). Absent: the task's own timer
   * of that day not yet counted, if any. Read only while PROOF_LAUNCH_DAY is in force.
   */
  sessionId?: string | null;
  /**
   * Pages proof (blueprint P24): a reading task's pages, { kind: 'PAGES', qty } (whole pages; anything else is none).
   * Read only while PROOF_LAUNCH_DAY is in force, for a pages task: recorded, never priced.
   */
  proof?: TickProofInput | null;
}

/**
 * Ticks a task: today, or yesterday inside the record window. Pays exactly
 * the projected price; a double tap pays once. Returns L3's moments for the
 * tick (a streak milestone, a habit rung, a finished goal) as `celebrations`.
 */
export async function completeTask(
  templateId: string,
  input?: CompleteTaskInput,
  opts?: TaskActionOptions
): Promise<TaskActionResult<WithCelebrations<Completion>>> {
  if (!isId(templateId)) return noId();
  const day = input?.day;
  const cleanDay = day === "yesterday" || day === "today" || (typeof day === "string" && DAY_KEY_RE.test(day)) ? day : "today";
  return run("completeTask", opts, async (userId) => {
    const res = await aroundTick(
      userId,
      { scope: "tick", templateIds: [templateId] },
      () =>
        completeInstanceCore(userId, templateId, {
          day: cleanDay,
          minutes: typeof input?.minutes === "number" ? input.minutes : null,
          mvv: input?.mvv === true,
          ...(isId(input?.sessionId) ? { sessionId: input.sessionId } : {}),
          ...proofOf(input?.proof),
        }),
      (v) => !v.duplicate
    );
    if (res.ok) recordPracticeAfter(userId, templateId);
    return res;
  });
}

/**
 * Ticks one of a task's steps today, or every step (`stepId` null), and re-prices what the task pays: the share of its
 * steps ticked (a must only once all are done). Returns what it pays now, the change, and L3's moments.
 */
export async function tickStep(
  templateId: string,
  stepId: string | null,
  done: boolean,
  opts?: TaskActionOptions
): Promise<TaskActionResult<WithCelebrations<StepTick>>> {
  if (!isId(templateId)) return noId();
  if (stepId !== null && !isId(stepId)) return { ok: false, error: "No step given." };
  return run("tickStep", opts, async (userId) => {
    const res = await aroundTick(
      userId,
      { scope: "tick", templateIds: [templateId] },
      () => stepTickCore(userId, templateId, { stepId, done: done === true }),
      (v) => v.delta !== 0
    );
    if (res.ok) recordPracticeAfter(userId, templateId);
    return res;
  });
}

/**
 * Undoes a tick within ten minutes, on the same day. Nets to zero. A tick
 * whose day has since been settled stands (M2). A make-up's undo goes to
 * undoMakeUpCore, which also takes its debt repayment back (M2 decision 10).
 */
export async function undoCompletion(instanceId: string, opts?: TaskActionOptions): Promise<TaskActionResult<{ instanceId: string; xp: number }>> {
  if (!isId(instanceId)) return noId();
  return run("undoCompletion", opts, async (userId) => {
    const res = await undoCompletionCore(userId, instanceId);
    if (res.ok) {
      recordPracticeAfter(userId, res.value.templateId);
      return { ok: true as const, value: { instanceId: res.value.instanceId, xp: res.value.xp } };
    }
    if (res.error !== MAKE_UP_UNDO_ELSEWHERE) return res;
    const undone = await undoMakeUpCore(userId, instanceId);
    if (!undone.ok) return undone;
    recordPracticeAfter(userId, () => templateIdOfInstance(userId, instanceId));
    return { ok: true as const, value: { instanceId, xp: undone.value.xp } };
  });
}

/**
 * The capture toast's Undo: takes a capture back within ten minutes.
 * `code: 'gone'`: the capture no longer exists, or an edit replaced it and
 * the new line still stands (the sheet says so instead of 'Removed').
 */
export async function undoCapture(templateId: string, opts?: TaskActionOptions): Promise<TaskActionResult<null> & { code?: "gone" }> {
  if (!isId(templateId)) return noId();
  // run() hands back the core's own object, so its 'gone' code reaches the sheet as typed here.
  return run("undoCapture", opts, (userId) => undoCaptureCore(userId, templateId)) as Promise<TaskActionResult<null> & { code?: "gone" }>;
}

/** Skips today's occurrence of a repeating, non-compulsory task. 0 XP; its streak holds. */
export async function skipTask(templateId: string, opts?: TaskActionOptions): Promise<TaskActionResult<null>> {
  if (!isId(templateId)) return noId();
  return run("skipTask", opts, (userId) => skipCore(userId, templateId));
}

/** The same habit once more today. Returns its moments as `celebrations`, like completeTask. */
export async function againTask(
  templateId: string,
  input?: Pick<CompleteTaskInput, "minutes" | "mvv" | "sessionId" | "proof">,
  opts?: TaskActionOptions
): Promise<TaskActionResult<WithCelebrations<Completion>>> {
  if (!isId(templateId)) return noId();
  return run("againTask", opts, async (userId) => {
    const res = await aroundTick(
      userId,
      { scope: "tick", templateIds: [templateId] },
      () =>
        againCore(userId, templateId, {
          minutes: typeof input?.minutes === "number" ? input.minutes : null,
          mvv: input?.mvv === true,
          ...(isId(input?.sessionId) ? { sessionId: input.sessionId } : {}),
          ...proofOf(input?.proof),
        }),
      (v) => !v.duplicate
    );
    if (res.ok) recordPracticeAfter(userId, templateId);
    return res;
  });
}

/** A tick's pages proof (P24), cleaned (proof.ts cleanTickProof): the key only when it brings pages. */
function proofOf(x: unknown): { proof?: TickProofInput } {
  const proof = cleanTickProof(x);
  return proof ? { proof } : {};
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Proof of work (blueprint P23): starts a task's timer (task-sessions-server startTimerCore: proof in force, live
 * writes, one running timer at a time, so a start stops any other). `clientId` is the start's key (a UUID the row
 * draws once): a retry starts it once. The timer is a row, so it survives a reload and another device.
 */
export async function startTaskTimer(
  templateId: string,
  clientId: string,
  opts?: TaskActionOptions & { source?: SessionSource }
): Promise<TaskActionResult<TimerView>> {
  if (!isId(templateId)) return noId();
  if (typeof clientId !== "string" || !UUID_RE.test(clientId)) return { ok: false, error: TIMER_CLIENT_ID };
  const source: SessionSource = isSessionSource(opts?.source) ? opts.source : "web";
  return run("startTaskTimer", opts, (userId) => startTimerCore(userId, { templateId, clientId: clientId.toLowerCase(), source }));
}

/** Stops a task's timer; its minutes wait for the tick that counts them. A stopped one answers as it stands. */
export async function stopTaskTimer(sessionId: string, opts?: TaskActionOptions): Promise<TaskActionResult<TimerView>> {
  if (!isId(sessionId)) return { ok: false, error: "No timer given." };
  return run("stopTaskTimer", opts, (userId) => stopTimerCore(userId, { sessionId }));
}

/**
 * Discards a task's timer (the row's Discard): its segments that day are closed counting nothing, so no tick counts
 * them and the row shows Start timer again. One a tick already counted is gone.
 */
export async function discardTaskTimer(sessionId: string, opts?: TaskActionOptions): Promise<TaskActionResult<TimerView>> {
  if (!isId(sessionId)) return { ok: false, error: "No timer given." };
  return run("discardTaskTimer", opts, (userId) => discardTimerCore(userId, { sessionId }));
}

/** Moves a one-off to tomorrow or a given day; on a repeating task, 'tomorrow' skips today. */
export async function rescheduleTask(templateId: string, to: "tomorrow" | DayKey, opts?: TaskActionOptions): Promise<TaskActionResult<{ dueDay: DayKey } | null>> {
  if (!isId(templateId)) return noId();
  if (typeof to !== "string") return { ok: false, error: "Pick a day." };
  return run("rescheduleTask", opts, (userId) => rescheduleCore(userId, templateId, to));
}

/**
 * Archives a task. Nothing with history is ever deleted. M2 (F3): a must,
 * once Duty is live and past its 60-minute typo grace, is archived only from
 * today + 7 — `effect: 'deferred'` with its effectiveDay, and the row stays
 * on the board until then ('must · ends Thu 8 Oct'); its Undo is
 * unarchiveTask, which cancels the pending archive.
 */
export async function archiveTask(templateId: string, opts?: TaskActionOptions): Promise<TaskActionResult<RuleChangeOutcome>> {
  if (!isId(templateId)) return noId();
  return run("archiveTask", opts, (userId) => archiveCore(userId, templateId));
}

/** What Defer… and Abort… send: the reason (or a chip: it fills the reason when nothing is typed). */
export interface DecisionInput {
  reason?: string;
  reasonTag?: string | null;
}

/**
 * Defers a task until `until` (an ISO instant: a quick pick or the date-and-time field), with a
 * reason (task-decisions.ts): off the board until then; a repeating non-must skips its days until
 * then (its streak holds); a must skips nothing and its day counts as not kept. Pays and takes no
 * XP. Its Undo is undoDecision, within ten minutes.
 */
export async function deferTask(templateId: string, input: DecisionInput & { until?: string }, opts?: TaskActionOptions): Promise<TaskActionResult<DecisionOutcome>> {
  if (!isId(templateId)) return noId();
  if (!input || typeof input !== "object") return { ok: false, error: "Say why, and pick when it comes back." };
  return run("deferTask", opts, (userId) => deferCore(userId, templateId, { reason: input.reason, reasonTag: input.reasonTag, until: input.until }));
}

/**
 * Aborts a task with a reason: just this time (`ONCE`, a repeating task: today skipped, or a
 * must off the board for the rest of today and not kept), or for good (`SERIES`, and any one-off:
 * archived through Archive's own path, so a must waits out its seven days and the answer says
 * when). Pays and takes no XP. Its Undo is undoDecision, within ten minutes.
 */
export async function abortTask(templateId: string, input: DecisionInput & { scope?: "ONCE" | "SERIES" }, opts?: TaskActionOptions): Promise<TaskActionResult<DecisionOutcome>> {
  if (!isId(templateId)) return noId();
  if (!input || typeof input !== "object") return { ok: false, error: "Say why." };
  return run("abortTask", opts, (userId) => abortCore(userId, templateId, { reason: input.reason, reasonTag: input.reasonTag, scope: input.scope }));
}

/** Undoes a defer or an abort within ten minutes, on the same day: exactly what it changed comes back. */
export async function undoDecision(decisionId: string, opts?: TaskActionOptions): Promise<TaskActionResult<UndoneDecision>> {
  if (!isId(decisionId)) return { ok: false, error: "No decision given." };
  return run("undoDecision", opts, (userId) => undoDecisionCore(userId, decisionId));
}

/** Brings back an archived (or dropped) task, history and streak intact: the Undo for Archive and Drop. */
export async function unarchiveTask(templateId: string, opts?: TaskActionOptions): Promise<TaskActionResult<UnarchiveOutcome>> {
  if (!isId(templateId)) return noId();
  return run("unarchiveTask", opts, (userId) => unarchiveCore(userId, templateId));
}

/** The player's own daily capacity in minutes (clamped 30..960, to 5). Until it is set, the tile's figure is a default. */
export async function setDailyCapacity(minutes: number, opts?: TaskActionOptions): Promise<TaskActionResult<{ minutes: number }>> {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return { ok: false, error: "Pick a number of minutes." };
  return run("setDailyCapacity", opts, (userId) => setDailyCapacityCore(userId, minutes));
}

const INBOX_CHOICES: readonly InboxChoice[] = ["today", "tomorrow", "anytime", "goal", "idea", "drop"];

/**
 * One-tap clarify for an inbox item: Today / Tomorrow / Anytime / Goal ^ / Idea / Drop.
 * M2 (F3): a Drop on a must goes through the akrasia horizon like Archive
 * (`effect: 'deferred'` and its effectiveDay when it waits); a must leaving
 * the inbox is owed from today, never before.
 */
export async function clarifyInbox(
  templateId: string,
  choice: InboxChoice,
  parentId?: string | null,
  opts?: TaskActionOptions
): Promise<TaskActionResult<ClarifyOutcome>> {
  if (!isId(templateId)) return noId();
  if (!INBOX_CHOICES.includes(choice)) return { ok: false, error: "Unknown choice." };
  return run("clarifyInbox", opts, (userId) => clarifyInboxCore(userId, templateId, choice, isId(parentId) ? parentId : null));
}

/** A goal's '+1' moves the streak and the goals; there is no habit rung, so the habits read is skipped. */
const GOAL_PARTS = ["streak", "goals"] as const;

/**
 * '+1' (or +n) on a goal measured by hand. Progress only goes up. Pass a
 * fresh `opId` per tap: a tap that reaches the server twice then counts once.
 * It counts for the streak, so its moments are the streak's and the goals'
 * (a finished goal), returned as `celebrations`.
 */
export async function goalProgress(
  templateId: string,
  qty?: number,
  opts?: TaskActionOptions & { opId?: string }
): Promise<TaskActionResult<WithCelebrations<{ qty: number }>>> {
  if (!isId(templateId)) return noId();
  const opId = typeof opts?.opId === "string" ? opts.opId : null;
  return run("goalProgress", opts, (userId) =>
    aroundTick(userId, { scope: GOAL_PARTS }, () => goalProgressCore(userId, templateId, typeof qty === "number" ? qty : 1, new Date(), opId))
  );
}

/** Closing a goal can move the goals, a track's depth (and so its level) and the character level. */
const GOAL_CLOSE_PARTS = ["goals", "levels", "tracks"] as const;

/** What closing a goal paid: the MP minted, g as measured, why it paid less than stated (or null), and the track depth added. */
export interface GoalCloseResult {
  paid: number;
  g: number | null;
  why: string | null;
  depth: number;
}

/**
 * Closes a goal: explicit and final. Pays what goals.ts closeDecision says
 * (its stated MP within the gates and caps, 0 allowed, never XP), writes the
 * one 'mp:GOAL:<id>' decision row, and returns the moments (a finished goal's
 * Seal) as `celebrations`. A second tap gets 'Already closed.' and pays nothing.
 * A close that raced another paying close (or a judged week's mints) is
 * refused with goals-server GOAL_CLOSE_STALE ('Something changed; try
 * again.') and pays nothing; trying again decides it afresh.
 */
export async function closeGoal(goalId: string, opts?: TaskActionOptions): Promise<TaskActionResult<WithCelebrations<GoalCloseResult>>> {
  if (!isId(goalId)) return noId();
  return run("closeGoal", opts, (userId) =>
    aroundTick(userId, { scope: GOAL_CLOSE_PARTS }, async () => {
      const res = await closeGoalCore(userId, goalId, new Date());
      if (!res.ok) return res;
      const p = res.payout;
      return { ok: true as const, value: { paid: p.pays, g: p.g, why: p.why, depth: p.depth } };
    })
  );
}

/** The Close sheet's answer when what closing pays could not be worked out now (nothing was closed). */
const PREVIEW_RETRY = "Couldn't work out what closing pays now. Try again.";

/**
 * What closing a goal now would pay, and why (the Close sheet's figure). null
 * when the goal is not open. Read-only for every goal but a roadmap
 * milestone's (F16 seam 6): goals-server prepareRoadmapGoalClose first
 * records its readings for today, where writes are on, so the preview and the
 * close decide from the same values; where they are off it decides from live
 * values labelled "not recorded on this server". Any other goal comes back
 * exactly as readGoalCloseInput reads it.
 *
 * A milestone's readings that cannot be worked out now (prepareRoadmapGoalClose
 * throws where the close would refuse with GOAL_CLOSE_RETRY: a database
 * failure, a refusal that is not final) answer PREVIEW_RETRY, never "Couldn't
 * save that": the preview saves nothing the user asked for.
 */
export async function previewGoalClose(goalId: string): Promise<TaskActionResult<GoalPayout | null>> {
  if (!isId(goalId)) return noId();
  return run("previewGoalClose", undefined, async (userId) => {
    try {
      const prep = await prepareRoadmapGoalClose(userId, goalId, new Date());
      return { ok: true as const, value: prep.input ? closeDecision(prep.input) : null };
    } catch (err) {
      console.error("previewGoalClose failed:", err);
      return { ok: false as const, error: PREVIEW_RETRY };
    }
  });
}

/** Moves an open goal's due day (today to ten years out). Its horizon and stated MP stay as they were set. */
export async function rescheduleGoal(goalId: string, day: DayKey, opts?: TaskActionOptions): Promise<TaskActionResult<{ dueDay: DayKey }>> {
  if (!isId(goalId)) return noId();
  if (typeof day !== "string" || !DAY_KEY_RE.test(day)) return { ok: false, error: "Pick a day." };
  return run("rescheduleGoal", opts, async (userId) => {
    const res = await rescheduleGoalCore(userId, goalId, day);
    return res.ok ? { ok: true as const, value: { dueDay: day } } : res;
  });
}

/** Renames a task; its grade and repeat-decay group stay. */
export async function renameTask(templateId: string, title: string, opts?: TaskActionOptions): Promise<TaskActionResult<{ title: string }>> {
  if (!isId(templateId)) return noId();
  if (typeof title !== "string") return { ok: false, error: "A task needs a title." };
  return run("renameTask", opts, (userId) => renameCore(userId, templateId, title));
}

/**
 * 'Resize': asks the AI to size the task again. One retry, only before the
 * grade freezes, and it counts toward the day's sizing cap (life-sizing.ts
 * enforces the cap). Runs inline, since the player is waiting on the answer;
 * the model call is bounded at a few seconds and a failure keeps the grade.
 */
export async function resizeTask(templateId: string, opts?: TaskActionOptions): Promise<TaskActionResult<{ outcome: string }>> {
  if (!isId(templateId)) return noId();
  return run("resizeTask", opts, async (userId) => {
    const allowed = await resizableCore(userId, templateId);
    if (!allowed.ok) return allowed;
    const outcome = await applySizing(templateId, { force: true });
    switch (outcome) {
      case "sized":
      case "copied":
        return { ok: true, value: { outcome } };
      case "failed":
      case "error":
        return { ok: false, error: "The AI didn't answer. The size stays as it was." };
      case "capped":
        return { ok: false, error: "Today's AI sizing limit is reached. Try again tomorrow, or self-rate it." };
      case "renamed":
        return { ok: false, error: "A renamed task keeps its size. Self-rate it instead." };
      case "done":
        return { ok: false, error: "This isn't something that gets sized." };
      default:
        return { ok: false, error: "The size is frozen now. Self-rate it instead." };
    }
  });
}

/** Self-rating: clamped to at most one band above the machine's, at least INTRO; once a week after the first completion. */
export async function setBandOverride(templateId: string, override: number, opts?: TaskActionOptions): Promise<TaskActionResult<{ bandOverride: number }>> {
  if (!isId(templateId)) return noId();
  if (typeof override !== "number" || !Number.isFinite(override)) return { ok: false, error: "Pick a size." };
  return run("setBandOverride", opts, (userId) => setBandOverrideCore(userId, templateId, override));
}
