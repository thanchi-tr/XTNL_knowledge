/**
 * Steps (subtasks), server side: the board's read and the drawer's edits. The tables (migration life_subtasks) fail
 * soft: missing, they read as no steps and an edit says so. The tick and its re-price live in tasks.ts stepTickCore,
 * beside the completion they share a lock, guards and ledger with.
 *
 *   loadSubtasks(userId, day)                    → Record<templateId, SubtaskDay>   (cached; tags life, activity)
 *   addSubtaskCore(userId, templateId, title)    → the new step
 *   renameSubtaskCore(userId, stepId, title)     → the step
 *   removeSubtaskCore(userId, stepId)            → the step's template (the row stays, archived)
 *
 * No step is ever made at capture: a task has steps only once the user adds them in its drawer.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { dateColumn, type DayKey } from "./life-day";
import { STEPS_MAX, STEPS_NOT_READY, cleanStepTitle, stepsAllowed, type Subtask, type SubtaskDay } from "./subtasks";

export type StepResult<T> = { ok: true; value: T } | { ok: false; error: string };

const NO_TASK = "That task is no longer here.";
const NO_STEP = "That step is no longer here.";
const SAVE_FAILED = "Couldn't save that. Try again.";

export function isMissingSubtaskTable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b(P2021|42P01)\b|(relation|table) [`"][^`"]*TaskSubtask(Tick)?[`"]? does not exist/i.test(message);
}

const okId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);

/** Every template's live steps and the ones ticked on `day`; a missing table (or any failure, logged) reads as none. */
export function loadSubtasks(userId: string, day: DayKey): Promise<Record<string, SubtaskDay>> {
  return cached(`subtasks:${userId}:${day}`, ["life", "activity"], async () => {
    try {
      const [steps, ticks] = await Promise.all([
        prisma.taskSubtask.findMany({
          where: { userId, archivedAt: null },
          orderBy: [{ templateId: "asc" }, { ord: "asc" }, { createdAt: "asc" }],
          select: { id: true, templateId: true, title: true, ord: true },
        }),
        prisma.taskSubtaskTick.findMany({ where: { userId, day: dateColumn(day) }, select: { subtaskId: true } }),
      ]);
      const ticked = new Set(ticks.map((x) => x.subtaskId));
      const out: Record<string, SubtaskDay> = {};
      for (const s of steps) {
        const d = (out[s.templateId] ??= { items: [], done: [] });
        d.items.push({ id: s.id, title: s.title, ord: s.ord });
        if (ticked.has(s.id)) d.done.push(s.id);
      }
      return out;
    } catch (err) {
      if (!isMissingSubtaskTable(err)) console.error("Steps: the steps failed to load; showing none.", err);
      return {};
    }
  });
}

/** Adds a step at the end of a task's list (STEPS_MAX at most). */
export async function addSubtaskCore(userId: string, templateId: string, rawTitle: unknown): Promise<StepResult<Subtask>> {
  if (!okId(templateId)) return { ok: false, error: NO_TASK };
  const title = cleanStepTitle(rawTitle);
  if (!title) return { ok: false, error: "Give the step a few words." };
  try {
    const t = await prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: { kind: true, autoMetric: true, archivedAt: true } });
    if (!t || t.archivedAt) return { ok: false, error: NO_TASK };
    if (!stepsAllowed(t)) return { ok: false, error: "Only tasks and habits can have steps." };
    const live = await prisma.taskSubtask.findMany({ where: { userId, templateId, archivedAt: null }, select: { ord: true } });
    if (live.length >= STEPS_MAX) return { ok: false, error: `${STEPS_MAX} steps at most.` };
    const ord = live.reduce((m, s) => Math.max(m, s.ord + 1), 0);
    const row = await prisma.taskSubtask.create({ data: { userId, templateId, title, ord }, select: { id: true, title: true, ord: true } });
    invalidate("life");
    return { ok: true, value: row };
  } catch (err) {
    if (isMissingSubtaskTable(err)) return { ok: false, error: STEPS_NOT_READY };
    console.error("Steps: a step wasn't added.", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/** Renames a step. */
export async function renameSubtaskCore(userId: string, stepId: string, rawTitle: unknown): Promise<StepResult<Subtask>> {
  if (!okId(stepId)) return { ok: false, error: NO_STEP };
  const title = cleanStepTitle(rawTitle);
  if (!title) return { ok: false, error: "Give the step a few words." };
  try {
    const n = await prisma.taskSubtask.updateMany({ where: { id: stepId, userId, archivedAt: null }, data: { title } });
    if (n.count === 0) return { ok: false, error: NO_STEP };
    invalidate("life");
    const row = await prisma.taskSubtask.findFirst({ where: { id: stepId, userId }, select: { id: true, title: true, ord: true } });
    return row ? { ok: true, value: row } : { ok: false, error: NO_STEP };
  } catch (err) {
    if (isMissingSubtaskTable(err)) return { ok: false, error: STEPS_NOT_READY };
    console.error("Steps: a step wasn't renamed.", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/**
 * Removes a step from the list (its row stays, archived, so a past day's tick still names it). What the task pays
 * today is re-priced at its next step tick; a payment already made stands.
 */
export async function removeSubtaskCore(userId: string, stepId: string): Promise<StepResult<{ templateId: string }>> {
  if (!okId(stepId)) return { ok: false, error: NO_STEP };
  try {
    const row = await prisma.taskSubtask.findFirst({ where: { id: stepId, userId, archivedAt: null }, select: { templateId: true } });
    if (!row) return { ok: false, error: NO_STEP };
    await prisma.taskSubtask.update({ where: { id: stepId }, data: { archivedAt: new Date() } });
    invalidate("life");
    return { ok: true, value: row };
  } catch (err) {
    if (isMissingSubtaskTable(err)) return { ok: false, error: STEPS_NOT_READY };
    console.error("Steps: a step wasn't removed.", err);
    return { ok: false, error: SAVE_FAILED };
  }
}
