/**
 * Task style and the month calendars (server only). The TaskStyle table fails soft — it may be missing on a database
 * the life_exercise_style migration has not reached — and reads as no style; a style save then says so. The month
 * reads use TaskInstance (always there). Cache tag 'life' for styles, 'activity' for the months (a tick changes them).
 *
 *   loadTaskStyles(userId)                         → Record<templateId, TaskStyle>
 *   setTaskStyleCore(userId, templateId, style)    → { ok } | { ok: false, error }   (both null clears it)
 *   loadTaskMonthCore(userId, templateId, month)   → { ok, value: { month, marks } } (the drawer's calendar)
 *   loadMonthDoneCore(userId, month)               → { ok, value: { month, days } }  (the profile's calendar)
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { dateColumn, keyOfDateColumn, type DayKey } from "./life-day";
import {
  DONE_MARK_STATUSES,
  daysInMonth,
  isMonthKey,
  isTaskColor,
  isTaskIcon,
  taskMonthMarksOf,
  taskStyleOf,
  type MonthDoneTask,
  type MonthKey,
  type TaskDayMark,
  type TaskStyle,
} from "./task-style";

export type StyleResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const STYLE_NOT_READY = "Icons and colours need a one-time database update first.";
const NO_TASK = "That task is no longer here.";
const BAD_MONTH = "Pick a month.";
const SAVE_FAILED = "Couldn't save that. Try again.";

export function isMissingStyleTable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b(P2021|42P01)\b|(relation|table) [`"][^`"]*TaskStyle[`"]? does not exist/i.test(message);
}

const okId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);

/** Every style of the user's templates; a missing table (or any failure, logged) reads as none. */
export function loadTaskStyles(userId: string): Promise<Record<string, TaskStyle>> {
  return cached(`taskStyles:${userId}`, ["life"], async () => {
    try {
      const rows = await prisma.taskStyle.findMany({ where: { userId }, select: { templateId: true, icon: true, color: true } });
      const out: Record<string, TaskStyle> = {};
      for (const r of rows) {
        const st = taskStyleOf(r);
        if (st.icon || st.color) out[r.templateId] = st;
      }
      return out;
    } catch (err) {
      if (!isMissingStyleTable(err)) console.error("Task style: the styles failed to load; showing none.", err);
      return {};
    }
  });
}

/** Sets a template's icon and colour (each a name from the sets, or null); both null removes the row. */
export async function setTaskStyleCore(userId: string, templateId: string, style: { icon: unknown; color: unknown }): Promise<StyleResult<TaskStyle>> {
  if (!okId(templateId)) return { ok: false, error: NO_TASK };
  if (style.icon !== null && !isTaskIcon(style.icon)) return { ok: false, error: "Pick one of the icons." };
  if (style.color !== null && !isTaskColor(style.color)) return { ok: false, error: "Pick one of the colours." };
  const value: TaskStyle = { icon: style.icon, color: style.color };
  try {
    const owned = await prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: { id: true } });
    if (!owned) return { ok: false, error: NO_TASK };
    if (value.icon == null && value.color == null) await prisma.taskStyle.deleteMany({ where: { templateId, userId } });
    else await prisma.taskStyle.upsert({ where: { templateId }, create: { templateId, userId, icon: value.icon, color: value.color }, update: { icon: value.icon, color: value.color } });
    invalidate("life");
    return { ok: true, value };
  } catch (err) {
    if (isMissingStyleTable(err)) return { ok: false, error: STYLE_NOT_READY };
    console.error("Task style: a style wasn't saved.", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

const monthRange = (month: MonthKey) => ({ gte: dateColumn(`${month}-01`), lte: dateColumn(`${month}-${String(daysInMonth(month)).padStart(2, "0")}`) });

/** One template's month: a done or missed mark a day (the drawer's calendar). */
export async function loadTaskMonthCore(userId: string, templateId: string, month: MonthKey): Promise<StyleResult<{ month: MonthKey; marks: Record<DayKey, TaskDayMark> }>> {
  if (!okId(templateId)) return { ok: false, error: NO_TASK };
  if (!isMonthKey(month)) return { ok: false, error: BAD_MONTH };
  try {
    return await cached(`taskMonth:${userId}:${templateId}:${month}`, ["activity", "life"], async () => {
      const rows = await prisma.taskInstance.findMany({ where: { userId, templateId, day: monthRange(month) }, select: { day: true, status: true } });
      return { ok: true as const, value: { month, marks: taskMonthMarksOf(rows.map((r) => ({ day: keyOfDateColumn(r.day), status: r.status })), month) } };
    });
  } catch (err) {
    console.error("Task month: the calendar failed to load.", err);
    return { ok: false, error: "Couldn't load that month. Try again." };
  }
}

/** The month's done tasks by day, each once a day, with its title and style (the profile's calendar). */
export async function loadMonthDoneCore(userId: string, month: MonthKey): Promise<StyleResult<{ month: MonthKey; days: Record<DayKey, MonthDoneTask[]> }>> {
  if (!isMonthKey(month)) return { ok: false, error: BAD_MONTH };
  try {
    return await cached(`monthDone:${userId}:${month}`, ["activity", "life"], async () => {
      const [rows, styles] = await Promise.all([
        prisma.taskInstance.findMany({
          where: { userId, day: monthRange(month), status: { in: [...DONE_MARK_STATUSES] } },
          select: { day: true, templateId: true },
          orderBy: [{ day: "asc" }, { completedAt: "asc" }],
        }),
        loadTaskStyles(userId),
      ]);
      const ids = Array.from(new Set(rows.map((r) => r.templateId)));
      const templates = ids.length ? await prisma.taskTemplate.findMany({ where: { userId, id: { in: ids } }, select: { id: true, title: true } }) : [];
      const titles = new Map(templates.map((t) => [t.id, t.title]));
      const days: Record<DayKey, MonthDoneTask[]> = {};
      for (const r of rows) {
        const title = titles.get(r.templateId);
        if (!title) continue;
        const day = keyOfDateColumn(r.day);
        const list = (days[day] ??= []);
        if (list.some((x) => x.templateId === r.templateId)) continue;
        const st = styles[r.templateId];
        list.push({ templateId: r.templateId, title, icon: st?.icon ?? null, color: st?.color ?? null });
      }
      return { ok: true as const, value: { month, days } };
    });
  } catch (err) {
    console.error("Month done: the calendar failed to load.", err);
    return { ok: false, error: "Couldn't load that month. Try again." };
  }
}
