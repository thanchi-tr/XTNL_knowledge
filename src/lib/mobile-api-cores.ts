/**
 * The Android app's routes bound to the web's own cores (docs/mobile-api.md; the handlers are
 * src/lib/mobile-api-server.ts). Each dep is the function the web's server action or page calls, called the way the
 * web calls it — never with `refresh` (refresh() runs only inside a Server Action, and a route has no page to
 * re-render), so each action's own cache invalidation, after() work and celebrations are exactly the web's.
 * scripts/mobile-api-check.ts pins every binding here; only the route files import this module.
 */
import { after } from "next/server";
import { prisma } from "./prisma";
import { getCurrentUserId } from "./user";
import { autoCompleteStudyTasks, loadTodayBoard, recordDayOpen } from "./tasks";
import { loadFieldTree } from "./queries";
import { getDailyStreak } from "./streak";
import { loadShellData } from "./shell-data";
import { loadModifiers } from "./skill-effects";
import { loadDueWorkTasks } from "./scheduled-tasks-server";
import { maybeMaintainLife } from "./settlement";
import { loadWeekAudit } from "./week-audit-server";
import { loadMomentum, settleMomentum } from "./momentum-server";
import { loadMainQuestCard, loadMainQuestWeek } from "./main-quest-server";
import { loadVariants } from "./idea-variants-server";
import { reviewDedupeKey } from "./srs";
import { loadReviewDay } from "../app/review/review-data";
import { completeTask, undoCapture, undoCompletion } from "../app/actions/tasks";
import { doneScheduledTask, reopenScheduledTask } from "../app/actions/scheduled-tasks";
import { submitReview } from "../app/actions/review";
import { createFromCapture, undoWeightCapture } from "../app/actions/capture";
import { submitIdea } from "../app/actions/ideas";
import { MOBILE_TOKEN_ENV } from "./mobile-api";
import type { MobileDeps } from "./mobile-api-server";

export const realMobileDeps: MobileDeps = {
  token: () => process.env[MOBILE_TOKEN_ENV],
  userId: () => getCurrentUserId(),
  now: () => new Date(),
  after: (task) => after(task),
  random: () => Math.random(),

  // GET /check: the Today page's board read, the Review page's reads, the shell's level, the work tabs' due tasks.
  loadBoard: (userId, day, now) => loadTodayBoard(userId, day, now),
  loadFieldTree: () => loadFieldTree(),
  loadReviewDay: (userId, day) => loadReviewDay(userId, day),
  loadStreak: (userId) => getDailyStreak(userId),
  loadShell: (userId) => loadShellData(userId),
  loadWork: (userId, now) => loadDueWorkTasks(userId, now),
  // The bell's fading line reads the ideas at the loadout's grace extension (notifications.ts loadLevelNotices).
  loadGraceExtra: async (userId) => (await loadModifiers(userId)).graceExtraDays,
  // /today/week's Week audit card (blueprint P11): null while AUDIT_LAUNCH_DAY is not in force.
  loadWeekAudit: (userId, now) => loadWeekAudit(userId, now),
  // What the Today and Review pages owe: momentum's settle the Today page awaits before its board read, the rest in after().
  recordDayOpen: (userId, dueCount, now) => recordDayOpen(userId, dueCount, now),
  autoCompleteStudyTasks: (userId, now) => autoCompleteStudyTasks(userId, now),
  maybeMaintainLife: (userId) => maybeMaintainLife(userId),
  settleMomentum: (userId, day, now) => settleMomentum(userId, day, { now }),

  // The board's tick and its Undo (actions/tasks.ts), as TodayBoard calls them less `refresh`.
  completeTask: (templateId, input) => completeTask(templateId, input),
  undoCompletion: (instanceId) => undoCompletion(instanceId),

  // The Agenda's Done (no history log) and its Undo (actions/scheduled-tasks.ts).
  doneScheduled: (id) => doneScheduledTask(id, null),
  reopenScheduled: (id) => reopenScheduledTask(id, null),

  // The review runner's answer (actions/review.ts) and the hub's variants; an answer's key read on the ledger's unique index.
  loadVariants: (ideaIds) => loadVariants(ideaIds),
  submitReview: (input) => submitReview(input),
  ideaLevel: async (ideaId) => (await prisma.idea.findUnique({ where: { id: ideaId }, select: { level: true } }))?.level ?? null,
  reviewRecorded: async (userId, answerKey) =>
    (await prisma.activityEvent.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: reviewDedupeKey(answerKey) } }, select: { id: true } })) !== null,

  // The capture sheet's save and Undos (actions/capture.ts, actions/tasks.ts undoCapture).
  createFromCapture: (text, captureKey) => createFromCapture(text, [], captureKey ? { captureKey } : undefined),
  undoCapture: (templateId) => undoCapture(templateId),
  undoWeightCapture: (weight) => undoWeightCapture(weight),

  // The New idea form's Create (actions/ideas.ts).
  submitIdea: (input) => submitIdea(input),

  // GET /quests (blueprint P15): Today's own reads for its Main quest card and MomentumCard (cached; none writes).
  loadMainQuest: (userId, now) => loadMainQuestCard(userId, now),
  loadSprintWeek: (userId, now, card) => loadMainQuestWeek(userId, now, card),
  loadMomentum: (userId, day, now) => loadMomentum(userId, day, { now }),
};
