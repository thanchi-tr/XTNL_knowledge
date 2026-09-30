import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { dayStartOf, todayKey } from "./life-day";
import { SIZING_PROMPT_VERSION, TASK_SIZING_MODEL, sizeLifeTask } from "./gemini";
import { SIZING_DAILY_CAP } from "./life-grade";
import { describeRule } from "./recurrence";
import { gradeFromCopy, gradeFromModel, pickCopySource, sizingSkipReason, type GradeUpdate } from "./life-lexicon";

/**
 * The one AI sizing a task gets, run in after() from task creation.
 *
 * The capture has already been written with its lexical grade, so nothing
 * here can lose it: every failure leaves that grade in place, and the
 * function never throws. In order:
 *
 * 1. Skip a grade that is frozen (the first completion, or 24 h after
 *    capture), a template renamed away from its grade key, anything that
 *    is not paid work (a goal, an idea draft), or a grade already made by
 *    the current prompt — unless forced by a resize.
 * 2. Copy the model grade of another task with the same normalised title,
 *    if one exists and its title still says those words: the per-title
 *    cache that makes a recurring or re-typed chore cost no model call, and
 *    makes the same words always size the same way. A self-rating is never
 *    copied, and neither is a grade made for other words (pickCopySource).
 * 3. Stop at the day's cap (40 model sizings per life day).
 * 4. Call the model once, and fold its answer in through the merge rules
 *    in life-lexicon.ts.
 *
 * Every write is an updateMany guarded by `gradeFrozenAt: null`, so a
 * completion that lands while the model is thinking wins: a frozen grade
 * is never overwritten. The pure rules live in life-lexicon.ts, where
 * scripts/life-grade-check.ts checks them without a database.
 */

export type SizingOutcome =
  | "missing"
  | "frozen"
  | "expired"
  | "renamed"
  | "done"
  | "copied"
  | "capped"
  | "sized"
  | "failed"
  | "error";

/** Noted on the basis when the day's model budget is spent, so the size panel says why the grade is still lexical. */
const CAPPED_NOTE = " · AI sizing paused (daily limit)";

async function write(templateId: string, update: GradeUpdate): Promise<boolean> {
  const { gradeAttemptsIncrement, composition, ...rest } = update;
  const data: Prisma.TaskTemplateUpdateManyMutationInput = {
    ...rest,
    ...(composition ? { composition: composition as Prisma.InputJsonValue } : {}),
    ...(gradeAttemptsIncrement ? { gradeAttempts: { increment: gradeAttemptsIncrement } } : {}),
  };
  const { count } = await prisma.taskTemplate.updateMany({ where: { id: templateId, gradeFrozenAt: null }, data });
  if (count > 0) invalidate("life");
  return count > 0;
}

/**
 * Sizes one template. `force` is the size panel's 'Resize': it skips the
 * per-title copy and re-asks the model, but still respects the freeze,
 * the 24-hour window and the daily cap. Resolves to what happened; never
 * rejects.
 */
export async function applySizing(templateId: string, opts: { force?: boolean; now?: Date } = {}): Promise<SizingOutcome> {
  const now = opts.now ?? new Date();
  try {
    const t = await prisma.taskTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        userId: true,
        kind: true,
        title: true,
        normTitle: true,
        note: true,
        recurrence: true,
        compulsory: true,
        dueKind: true,
        track: true,
        trackSource: true,
        estMinutes: true,
        minutesSource: true,
        gradeSource: true,
        gradePromptVersion: true,
        gradeBasis: true,
        gradeFrozenAt: true,
        createdAt: true,
      },
    });
    if (!t) return "missing";
    // A goal pays through its steps and an idea draft is filed, not done:
    // neither is priced, so neither spends a model call or a cap slot.
    if (t.kind === "GOAL" || t.kind === "IDEA_DRAFT") return "done";

    const skip = sizingSkipReason(t, now, { force: opts.force, promptVersion: SIZING_PROMPT_VERSION });
    if (skip) return skip;

    // Both reads at once: a round trip is the expensive part of this path.
    const [siblings, sizedToday] = await Promise.all([
      opts.force
        ? []
        : prisma.taskTemplate.findMany({
            where: {
              userId: t.userId,
              normTitle: t.normTitle,
              id: { not: t.id },
              gradeSource: "AI",
              gradePromptVersion: SIZING_PROMPT_VERSION,
            },
            orderBy: { aiGradedAt: "desc" },
            // A few, so a renamed newest one does not hide an honest older one.
            take: 5,
            select: {
              id: true,
              title: true,
              normTitle: true,
              category: true,
              band: true,
              aiBand: true,
              machineMinutes: true,
              composition: true,
              gradeConfidence: true,
              gradeBasis: true,
              gradeModel: true,
              gradePromptVersion: true,
            },
          }),
      prisma.taskTemplate.count({
        where: { userId: t.userId, aiGradedAt: { gte: dayStartOf(todayKey(now)) } },
      }),
    ]);

    const sibling = pickCopySource(t, siblings);
    if (sibling) return (await write(t.id, gradeFromCopy(t, sibling))) ? "copied" : "frozen";

    if (sizedToday >= SIZING_DAILY_CAP) {
      const basis = t.gradeBasis ?? "";
      if (!basis.endsWith(CAPPED_NOTE)) await write(t.id, { gradeBasis: `${basis}${CAPPED_NOTE}`.trim() });
      return "capped";
    }

    const result = await sizeLifeTask(t.title, {
      schedule: t.recurrence ? describeRule(t.recurrence) : null,
      compulsory: t.compulsory,
      dated: t.dueKind ? t.dueKind.toLowerCase() : null,
      note: t.note,
    });
    const wrote = await write(
      t.id,
      gradeFromModel(t, result, { model: TASK_SIZING_MODEL, promptVersion: SIZING_PROMPT_VERSION, now: new Date() })
    );
    if (!wrote) return "frozen";
    return result.ok ? "sized" : "failed";
  } catch (e) {
    // Swallowed on purpose: this runs in after(), where a throw can only
    // become an unhandled rejection. The lexical grade already stands.
    console.error(`applySizing(${templateId}) failed:`, e);
    return "error";
  }
}
